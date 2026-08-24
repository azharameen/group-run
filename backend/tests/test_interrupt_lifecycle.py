import queue
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
import app.services.interrupt_service as interrupt_module
from app.services.interrupt_service import InterruptService


@pytest.fixture()
def ctx(monkeypatch):
    InterruptService._instance = None

    events = []
    monkeypatch.setattr(interrupt_module._bus, "publish", lambda et, p: events.append((et, p)))

    client = TestClient(create_app())
    yield {"client": client, "events": events, "svc": InterruptService.instance()}
    InterruptService._instance = None


def _create_interrupt(ctx, thread_id="thread-1", tool_name="edit_file", message="Approve?", tool_input=None):
    payload = {"thread_id": thread_id, "tool_name": tool_name, "message": message}
    if tool_input is not None:
        payload["tool_input"] = tool_input
    res = ctx["client"].post("/api/interrupts/", json=payload)
    assert res.status_code == 201
    return res.json()["interrupt"]


def test_full_approve_lifecycle(ctx):
    interrupt = _create_interrupt(ctx, tool_input={"path": "x.txt"})
    res = ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    assert res.status_code == 200
    assert ctx["svc"].get_interrupt(interrupt["id"])["status"] == "approved"
    assert [e[0] for e in ctx["events"]] == ["interrupt.created", "interrupt.approved"]


def test_full_reject_lifecycle(ctx):
    interrupt = _create_interrupt(ctx)
    res = ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    assert res.status_code == 200
    assert ctx["svc"].get_interrupt(interrupt["id"])["status"] == "rejected"
    assert [e[0] for e in ctx["events"]] == ["interrupt.created", "interrupt.rejected"]


def test_cross_action_approve_then_reject(ctx):
    interrupt = _create_interrupt(ctx)
    assert ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"}).status_code == 200
    assert ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "later"}).status_code == 409


def test_cross_action_reject_then_approve(ctx):
    interrupt = _create_interrupt(ctx)
    assert ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"}).status_code == 200
    assert ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "later"}).status_code == 409


def test_pending_after_partial_resolution(ctx):
    i1 = _create_interrupt(ctx, thread_id="t1")
    i2 = _create_interrupt(ctx, thread_id="t2")
    i3 = _create_interrupt(ctx, thread_id="t3")
    ctx["client"].patch(f"/api/interrupts/{i1['id']}/approve", json={"decision": "approved", "reason": "ok"})
    ctx["client"].patch(f"/api/interrupts/{i2['id']}/reject", json={"decision": "rejected", "reason": "no"})
    res = ctx["client"].get("/api/interrupts/pending")
    assert res.status_code == 200
    assert len(res.json()["interrupts"]) == 1 and res.json()["interrupts"][0]["id"] == i3["id"]


def test_pending_empty_when_all_resolved(ctx):
    i1 = _create_interrupt(ctx, thread_id="t1")
    i2 = _create_interrupt(ctx, thread_id="t2")
    ctx["client"].patch(f"/api/interrupts/{i1['id']}/approve", json={"decision": "approved", "reason": "ok"})
    ctx["client"].patch(f"/api/interrupts/{i2['id']}/reject", json={"decision": "rejected", "reason": "no"})
    res = ctx["client"].get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json()["interrupts"] == []


def test_concurrent_approve_reject(ctx):
    """Test concurrent approve/reject at the service layer.
    
    TestClient doesn't support concurrent requests safely with SQLite,
    so we test the atomic UPDATE guarantee directly via the service.
    """
    interrupt = _create_interrupt(ctx)
    results = queue.Queue()

    def approve():
        try:
            results.put(ctx["svc"].approve_interrupt(interrupt["id"], "approved", "ok"))
        except Exception as e:
            results.put(e)

    def reject():
        try:
            results.put(ctx["svc"].reject_interrupt(interrupt["id"], "no"))
        except Exception as e:
            results.put(e)

    threads = [threading.Thread(target=approve), threading.Thread(target=reject)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    results_list = [results.get() for _ in range(2)]
    # Exactly one returns an interrupt dict, the other returns None
    assert any(r is not None for r in results_list)
    assert any(r is None for r in results_list)
    # DB is consistent
    assert ctx["svc"].get_interrupt(interrupt["id"])["status"] in ("approved", "rejected")


def test_sse_events_have_matching_interrupt_ids(ctx):
    interrupt = _create_interrupt(ctx)
    ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    ids = [payload["interrupt"]["id"] for _, payload in ctx["events"]]
    assert ids == [interrupt["id"], interrupt["id"]]
