from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.responses import StreamingResponse

import app.services.interrupt_service as interrupt_module
from app.api.routes.sse import sse
from app.services.interrupt_service import InterruptService


@pytest.fixture()
def service(monkeypatch):
    InterruptService._instance = None
    svc = InterruptService.instance()
    yield svc
    InterruptService._instance = None


@pytest.mark.asyncio
async def test_sse_endpoint_returns_streaming_response():
    """Verify SSE endpoint returns StreamingResponse with correct media type."""
    result = await sse()
    assert isinstance(result, StreamingResponse)
    assert result.media_type == "text/event-stream"


def test_create_interrupt_publishes_event(service):
    with patch.object(interrupt_module._bus, "publish") as publish:
        interrupt = service.create_interrupt("thread-1", "write_file", "Need approval", {"path": "x.txt"})

    publish.assert_called_once()
    event_type, payload = publish.call_args.args
    assert event_type == "interrupt.created"
    assert payload["thread_id"] == "thread-1"
    assert payload["interrupt"]["id"] == interrupt["id"]


def test_approve_interrupt_publishes_event(service):
    interrupt = service.create_interrupt("thread-2", "edit_file", "Approve me")
    with patch.object(interrupt_module._bus, "publish") as publish:
        updated = service.approve_interrupt(interrupt["id"], "approved", "ok")

    publish.assert_called_once()
    event_type, payload = publish.call_args.args
    assert event_type == "interrupt.approved"
    assert payload["thread_id"] == "thread-2"
    assert payload["interrupt"]["status"] == "approved"
    assert updated["id"] == interrupt["id"]


def test_reject_interrupt_publishes_event(service):
    interrupt = service.create_interrupt("thread-3", "delete", "Reject me")
    with patch.object(interrupt_module._bus, "publish") as publish:
        updated = service.reject_interrupt(interrupt["id"], "no")

    publish.assert_called_once()
    event_type, payload = publish.call_args.args
    assert event_type == "interrupt.rejected"
    assert payload["thread_id"] == "thread-3"
    assert payload["interrupt"]["status"] == "rejected"
    assert updated["id"] == interrupt["id"]
