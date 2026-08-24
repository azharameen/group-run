from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
import app.services.interrupt_service as interrupt_module
from app.services.interrupt_service import InterruptService


@pytest.fixture()
def client(monkeypatch):
    InterruptService._instance = None
    client = TestClient(create_app())
    yield client
    InterruptService._instance = None
    InterruptService._instance = None


def test_list_pending_empty(client):
    res = client.get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json() == {"interrupts": []}


def test_list_pending_with_data(client):
    interrupt = InterruptService.instance().create_interrupt(
        "thread-1", "write_file", "Need approval", {"path": "x.txt"}
    )
    res = client.get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json()["interrupts"][0]["id"] == interrupt["id"]


def test_create_interrupt_valid(client):
    res = client.post(
        "/api/interrupts/", json={"thread_id": "thread-1", "tool_name": "edit_file", "message": "Approve?"}
    )
    assert res.status_code == 201
    body = res.json()["interrupt"]
    assert body["thread_id"] == "thread-1"
    assert body["tool_name"] == "edit_file"
    assert body["message"] == "Approve?"
    assert body["status"] == "pending"


def test_create_interrupt_persists_reasoning(client):
    res = client.post(
        "/api/interrupts/",
        json={
            "thread_id": "thread-1",
            "tool_name": "edit_file",
            "message": "Approve?",
            "reasoning": "The file change is necessary and low risk.",
        },
    )
    assert res.status_code == 201
    assert res.json()["interrupt"]["reasoning"] == "The file change is necessary and low risk."


def test_create_interrupt_missing_fields(client):
    assert client.post("/api/interrupts/", json={"tool_name": "edit_file", "message": "Approve?"}).status_code == 422


def test_approve_interrupt_valid(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "edit_file", "Approve me")
    res = client.patch(
        f"/api/interrupts/{interrupt['id']}/approve",
        json={"decision": "approved", "reason": "ok", "reasoning": "This change is safe."},
    )
    assert res.status_code == 200
    assert res.json()["interrupt"]["status"] == "approved"
    assert res.json()["interrupt"]["reasoning"] == "This change is safe."


def test_approve_interrupt_not_found(client):
    res = client.patch("/api/interrupts/missing/approve", json={"decision": "approved", "reason": "ok"})
    assert res.status_code == 404


def test_approve_interrupt_already_resolved(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "edit_file", "Approve me")
    client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    res = client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "again"})
    assert res.status_code == 409


def test_reject_interrupt_valid(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "delete", "Reject me")
    res = client.patch(
        f"/api/interrupts/{interrupt['id']}/reject",
        json={"decision": "rejected", "reason": "no", "reasoning": "This is a dangerous deletion."},
    )
    assert res.status_code == 200
    assert res.json()["interrupt"]["status"] == "rejected"
    assert res.json()["interrupt"]["reasoning"] == "This is a dangerous deletion."


def test_reject_interrupt_not_found(client):
    res = client.patch("/api/interrupts/missing/reject", json={"decision": "rejected", "reason": "no"})
    assert res.status_code == 404


def test_reject_interrupt_already_resolved(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "delete", "Reject me")
    client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    res = client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "again"})
    assert res.status_code == 409


# ── Resume endpoint (Story 8.4) ─────────────────────────────────────────────

def _resolved_interrupt(client, status="approved"):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "write_file", "Approve?", {"path": "x.txt"})
    if status == "approved":
        client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    else:
        client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    return interrupt


def test_resume_unknown_interrupt_404(client):
    res = client.post("/api/interrupts/missing/resume", json={})
    assert res.status_code == 404


def test_resume_pending_interrupt_409(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "write_file", "Approve?")
    res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 409
    assert "not resolved" in res.json()["detail"]


def test_resume_approve_builds_approve_decision(client):
    interrupt = _resolved_interrupt(client, "approved")
    with patch("app.agent.runner.resume_agent", new=AsyncMock(return_value={"output": "done"})) as mock_resume:
        res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 200
    mock_resume.assert_awaited_once_with(interrupt["thread_id"], [{"type": "approve"}])
    assert res.json()["response"] == "done"


def test_resume_reject_builds_reject_decision(client):
    interrupt = _resolved_interrupt(client, "rejected")
    with patch("app.agent.runner.resume_agent", new=AsyncMock(return_value={"output": "ok"})) as mock_resume:
        res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 200
    mock_resume.assert_awaited_once_with(interrupt["thread_id"], [{"type": "reject", "message": "no"}])


def test_resume_no_checkpoint_409(client):
    interrupt = _resolved_interrupt(client, "approved")
    with patch("app.agent.runner.resume_agent", new=AsyncMock(side_effect=RuntimeError("no checkpoint"))):
        res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 409
    assert "no resumable state" in res.json()["detail"]


def test_create_interrupt_delivery_failure_returns_500(client):
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        res = client.post(
            "/api/interrupts/", json={"thread_id": "thread-1", "tool_name": "edit_file", "message": "Approve?"}
        )
        assert res.status_code == 500
        assert "Failed to deliver interrupt.created event" in res.json()["detail"]
