import sqlite3
from pathlib import Path

import pytest

import app.services.interrupt_service as interrupt_module
from unittest.mock import patch

from app.services.interrupt_service import InterruptDeliveryError, InterruptService


@pytest.fixture()
def service(tmp_path, monkeypatch):
    db_path = Path(tmp_path) / "threads.sqlite"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    class DummyCheckpointer:
        def __init__(self, conn):
            self.conn = conn

    monkeypatch.setattr(InterruptService, "_conn", lambda self: conn)
    InterruptService._instance = None
    svc = InterruptService.instance()
    yield svc
    conn.close()
    InterruptService._instance = None


def test_list_pending_empty(service):
    assert service.list_pending() == []


def test_create_and_list_pending(service):
    interrupt = service.create_interrupt("thread-1", "write_file", "Need approval", {"path": "x.txt"})
    pending = service.list_pending()
    assert len(pending) == 1
    assert pending[0]["id"] == interrupt["id"]
    assert pending[0]["status"] == "pending"


def test_approve_interrupt(service):
    interrupt = service.create_interrupt("thread-1", "edit_file", "Approve me")
    updated = service.approve_interrupt(interrupt["id"], "approved", "ok")
    assert updated["status"] == "approved"
    assert updated["decision"] == "approved"


def test_reject_interrupt(service):
    interrupt = service.create_interrupt("thread-1", "delete", "Reject me")
    updated = service.reject_interrupt(interrupt["id"], "no")
    assert updated["status"] == "rejected"
    assert updated["decision"] == "rejected"


def test_nonexistent_interrupt_returns_none(service):
    assert service.approve_interrupt("missing", "approved") is None
    assert service.reject_interrupt("missing", "no") is None


def test_resolved_interrupt_cannot_transition(service):
    interrupt = service.create_interrupt("thread-1", "write_file", "Once")
    service.approve_interrupt(interrupt["id"], "approved")
    assert service.approve_interrupt(interrupt["id"], "approved") is None
    assert service.reject_interrupt(interrupt["id"], "later") is None



# ── Provenance (Story 8.4) ────────────────────────────────────────────────

def test_create_interrupt_stores_provenance(service):
    interrupt = service.create_interrupt(
        "thread-1", "write_file", "Approve?", {"path": "x.txt"},
        decided_by="agent", confidence="low", alternatives=["approve", "reject"],
    )
    assert interrupt["decided_by"] == "agent"
    assert interrupt["confidence"] == "low"
    assert interrupt["alternatives"] == ["approve", "reject"]
    assert interrupt["decided_at"] is None
    assert interrupt["reason"] is None


def test_approve_sets_user_provenance(service):
    interrupt = service.create_interrupt("thread-1", "edit_file", "Approve me")
    updated = service.approve_interrupt(interrupt["id"], "approved", "looks good")
    assert updated["decided_by"] == "user"
    assert updated["confidence"] == "high"
    assert updated["decided_at"] is not None
    assert updated["reason"] == "looks good"


def test_reject_sets_user_provenance(service):
    interrupt = service.create_interrupt("thread-1", "delete", "Reject me")
    updated = service.reject_interrupt(interrupt["id"], "not now")
    assert updated["decided_by"] == "user"
    assert updated["confidence"] == "high"
    assert updated["decided_at"] is not None
    assert updated["reason"] == "not now"


def test_list_all_returns_audit_trail(service):
    i1 = service.create_interrupt("thread-1", "write_file", "One")
    i2 = service.create_interrupt("thread-1", "delete", "Two")
    all_rows = service.list_all()
    assert len(all_rows) == 2
    assert {r["id"] for r in all_rows} == {i1["id"], i2["id"]}

def test_create_interrupt_delivery_failure(service, caplog):
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        with pytest.raises(InterruptDeliveryError, match="Failed to deliver interrupt.created event"):
            service.create_interrupt("thread-1", "write_file", "Need approval")

    assert "Failed to deliver interrupt.created event" in caplog.text


def test_approve_interrupt_delivery_failure(service, caplog):
    interrupt = service.create_interrupt("thread-1", "edit_file", "Approve me")
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        with pytest.raises(InterruptDeliveryError, match="Failed to deliver interrupt.approved event"):
            service.approve_interrupt(interrupt["id"], "approved", "ok")

    assert "Failed to deliver interrupt.approved event" in caplog.text


def test_reject_interrupt_delivery_failure(service, caplog):
    interrupt = service.create_interrupt("thread-1", "delete", "Reject me")
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        with pytest.raises(InterruptDeliveryError, match="Failed to deliver interrupt.rejected event"):
            service.reject_interrupt(interrupt["id"], "no")

    assert "Failed to deliver interrupt.rejected event" in caplog.text

