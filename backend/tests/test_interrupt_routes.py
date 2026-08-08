import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
import app.services.interrupt_service as interrupt_module
from app.services.interrupt_service import InterruptService


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = Path(tmp_path) / "interrupts.sqlite"
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row

    class DummyCheckpointer:
        def __init__(self, conn):
            self.conn = conn

    monkeypatch.setattr(interrupt_module, "get_checkpointer", lambda: DummyCheckpointer(conn))
    monkeypatch.setattr(interrupt_module.sqlite3, "connect", lambda *args, **kwargs: conn)
    InterruptService._instance = None
    client = TestClient(create_app())
    yield client
    conn.close()
    InterruptService._instance = None


def test_list_pending_empty(client):
    res = client.get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json() == {"interrupts": []}


def test_list_pending_with_data(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "write_file", "Need approval", {"path": "x.txt"})
    res = client.get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json()["interrupts"][0]["id"] == interrupt["id"]


def test_create_interrupt_valid(client):
    res = client.post("/api/interrupts/", json={"thread_id": "thread-1", "tool_name": "edit_file", "message": "Approve?"})
    assert res.status_code == 201
    body = res.json()["interrupt"]
    assert body["thread_id"] == "thread-1"
    assert body["tool_name"] == "edit_file"
    assert body["message"] == "Approve?"
    assert body["status"] == "pending"


def test_create_interrupt_missing_fields(client):
    assert client.post("/api/interrupts/", json={"tool_name": "edit_file", "message": "Approve?"}).status_code == 422


def test_approve_interrupt_valid(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "edit_file", "Approve me")
    res = client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    assert res.status_code == 200
    assert res.json()["interrupt"]["status"] == "approved"


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
    res = client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    assert res.status_code == 200
    assert res.json()["interrupt"]["status"] == "rejected"


def test_reject_interrupt_not_found(client):
    res = client.patch("/api/interrupts/missing/reject", json={"decision": "rejected", "reason": "no"})
    assert res.status_code == 404


def test_reject_interrupt_already_resolved(client):
    interrupt = InterruptService.instance().create_interrupt("thread-1", "delete", "Reject me")
    client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    res = client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "again"})
    assert res.status_code == 409
