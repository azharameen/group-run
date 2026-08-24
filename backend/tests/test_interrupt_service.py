from pathlib import Path
from unittest.mock import patch

import pytest

import app.services.interrupt_service as interrupt_module
from app.services.interrupt_service import InterruptDeliveryError, InterruptService


@pytest.fixture
async def service():
    from sqlalchemy import text
    from app.db.session import get_session_factory
    async with get_session_factory()() as session:
        await session.execute(text("DELETE FROM interrupts"))
        await session.commit()
    InterruptService._instance = None
    svc = InterruptService.instance()
    yield svc
    InterruptService._instance = None


@pytest.mark.asyncio
async def test_list_pending_empty(service):
    assert await service.list_pending() == []


@pytest.mark.asyncio
async def test_create_and_list_pending(service):
    interrupt = await service.create_interrupt("thread-1", "write_file", "Need approval", {"path": "x.txt"})
    pending = await service.list_pending()
    assert len(pending) == 1
    assert pending[0]["id"] == interrupt["id"]
    assert pending[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_approve_interrupt(service):
    interrupt = await service.create_interrupt("thread-1", "edit_file", "Approve me")
    updated = await service.approve_interrupt(interrupt["id"], "approved", "ok")
    assert updated is not None
    assert updated["status"] == "approved"
    assert updated["decision"] == "approved"


@pytest.mark.asyncio
async def test_reject_interrupt(service):
    interrupt = await service.create_interrupt("thread-1", "delete", "Reject me")
    updated = await service.reject_interrupt(interrupt["id"], "no")
    assert updated is not None
    assert updated["status"] == "rejected"
    assert updated["decision"] == "rejected"


@pytest.mark.asyncio
async def test_nonexistent_interrupt_returns_none(service):
    assert await service.approve_interrupt("missing", "approved") is None
    assert await service.reject_interrupt("missing", "no") is None


@pytest.mark.asyncio
async def test_resolved_interrupt_cannot_transition(service):
    interrupt = await service.create_interrupt("thread-1", "write_file", "Once")
    await service.approve_interrupt(interrupt["id"], "approved")
    assert await service.approve_interrupt(interrupt["id"], "approved") is None
    assert await service.reject_interrupt(interrupt["id"], "later") is None


# ── Provenance (Story 8.4) ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_interrupt_stores_provenance(service):
    interrupt = await service.create_interrupt(
        "thread-1", "write_file", "Approve?", {"path": "x.txt"},
        decided_by="agent", confidence="low", alternatives=["approve", "reject"],
    )
    assert interrupt["decided_by"] == "agent"
    assert interrupt["confidence"] == "low"
    assert interrupt["alternatives"] == ["approve", "reject"]
    assert interrupt["decided_at"] is None
    assert interrupt["reason"] is None


@pytest.mark.asyncio
async def test_approve_sets_user_provenance(service):
    interrupt = await service.create_interrupt("thread-1", "edit_file", "Approve me")
    updated = await service.approve_interrupt(interrupt["id"], "approved", "looks good")
    assert updated is not None
    assert updated["decided_by"] == "user"
    assert updated["confidence"] == "high"
    assert updated["decided_at"] is not None
    assert updated["reason"] == "looks good"


@pytest.mark.asyncio
async def test_reject_sets_user_provenance(service):
    interrupt = await service.create_interrupt("thread-1", "delete", "Reject me")
    updated = await service.reject_interrupt(interrupt["id"], "not now")
    assert updated is not None
    assert updated["decided_by"] == "user"
    assert updated["confidence"] == "high"
    assert updated["decided_at"] is not None
    assert updated["reason"] == "not now"


@pytest.mark.asyncio
async def test_list_all_returns_audit_trail(service):
    i1 = await service.create_interrupt("thread-1", "write_file", "One")
    i2 = await service.create_interrupt("thread-1", "delete", "Two")
    all_rows = await service.list_all()
    assert {i1["id"], i2["id"]}.issubset({r["id"] for r in all_rows})


@pytest.mark.asyncio
async def test_create_interrupt_delivery_failure(service, caplog):
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        with pytest.raises(InterruptDeliveryError, match="Failed to deliver interrupt.created event"):
            await service.create_interrupt("thread-1", "write_file", "Need approval")

    assert "Failed to deliver interrupt.created event" in caplog.text


@pytest.mark.asyncio
async def test_approve_interrupt_delivery_failure(service, caplog):
    interrupt = await service.create_interrupt("thread-1", "edit_file", "Approve me")
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        with pytest.raises(InterruptDeliveryError, match="Failed to deliver interrupt.approved event"):
            await service.approve_interrupt(interrupt["id"], "approved", "ok")

    assert "Failed to deliver interrupt.approved event" in caplog.text


@pytest.mark.asyncio
async def test_reject_interrupt_delivery_failure(service, caplog):
    interrupt = await service.create_interrupt("thread-1", "delete", "Reject me")
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        with pytest.raises(InterruptDeliveryError, match="Failed to deliver interrupt.rejected event"):
            await service.reject_interrupt(interrupt["id"], "no")

    assert "Failed to deliver interrupt.rejected event" in caplog.text

