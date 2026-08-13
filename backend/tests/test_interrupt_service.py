import sqlite3
from pathlib import Path

import pytest

import app.services.interrupt_service as interrupt_module
from app.services.interrupt_service import InterruptService


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
