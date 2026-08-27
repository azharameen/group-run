
import app.services.interrupt_service as interrupt_module
import pytest
from app.api.app import create_app
from app.services.interrupt_service import InterruptService
from fastapi.testclient import TestClient


@pytest.fixture
async def ctx(monkeypatch):
    from app.db.session import get_session_factory
    from sqlalchemy import text
    async with get_session_factory()() as session:
        await session.execute(text("DELETE FROM interrupts"))
        await session.commit()
    InterruptService._instance = None

    events = []
    monkeypatch.setattr(interrupt_module._bus, "publish", lambda et, p: events.append((et, p)))

    client = TestClient(create_app())
    yield {"client": client, "events": events, "svc": InterruptService.instance()}
    InterruptService._instance = None


def _create_interrupt(ctx, thread_id=None, tool_name="edit_file", message="Approve?", tool_input=None):
    # Interrupt creation requires an existing owner-scoped thread; create one
    # via the API. The thread_id argument only distinguishes separate threads
    # across calls (its literal value is not used).
    created = ctx["client"].post("/api/threads", json={"title": thread_id or "Interrupt thread"})
    assert created.status_code == 200
    real_thread_id = created.json()["thread"]["thread_id"]
    payload = {"thread_id": real_thread_id, "tool_name": tool_name, "message": message}
    if tool_input is not None:
        payload["tool_input"] = tool_input
    res = ctx["client"].post("/api/interrupts/", json=payload)
    assert res.status_code == 201
    return res.json()["interrupt"]


@pytest.mark.asyncio
async def test_full_approve_lifecycle(ctx):
    interrupt = _create_interrupt(ctx, tool_input={"path": "x.txt"})
    res = ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    assert res.status_code == 200
    stored = await ctx["svc"].get_interrupt(interrupt["id"])
    assert stored is not None
    assert stored["status"] == "approved"
    assert [e[0] for e in ctx["events"]] == ["interrupt.created", "interrupt.approved"]


@pytest.mark.asyncio
async def test_full_reject_lifecycle(ctx):
    interrupt = _create_interrupt(ctx)
    res = ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    assert res.status_code == 200
    stored = await ctx["svc"].get_interrupt(interrupt["id"])
    assert stored is not None
    assert stored["status"] == "rejected"
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


@pytest.mark.asyncio
async def test_concurrent_approve_reject(ctx):
    import asyncio
    interrupt = _create_interrupt(ctx)

    results = await asyncio.gather(
        ctx["svc"].approve_interrupt(interrupt["id"], "approved", "ok"),
        ctx["svc"].reject_interrupt(interrupt["id"], "no"),
        return_exceptions=True,
    )
    # Exactly one returns an interrupt dict, the other returns None
    assert any(r is not None and not isinstance(r, Exception) for r in results)
    assert any(r is None for r in results)
    stored = await ctx["svc"].get_interrupt(interrupt["id"])
    assert stored is not None
    assert stored["status"] in ("approved", "rejected")


def test_sse_events_have_matching_interrupt_ids(ctx):
    interrupt = _create_interrupt(ctx)
    ctx["client"].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    ids = [payload["interrupt"]["id"] for _, payload in ctx["events"]]
    assert ids == [interrupt["id"], interrupt["id"]]
