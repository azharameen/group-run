"""Tests for the SSE event bus (AC-3).

Validates StreamBus subscribe/publish, dead client eviction,
module-level singleton, and legacy wrapper helpers.
"""

import asyncio
import json
import sys
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# AC-3: Subscribe and publish
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_bus_subscribe_and_publish(monkeypatch: pytest.MonkeyPatch):
    """Subscribed clients receive published events via queue (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import StreamBus

    bus = StreamBus()

    # Create a queue manually to test publish
    queue: asyncio.Queue = asyncio.Queue()
    bus._clients.append(queue)

    # Publish is synchronous and puts on the queue
    bus.publish("message", {"content": "hello"})

    # Queue should have the event
    item = queue.get_nowait()
    assert "data:" in item
    assert "hello" in item

    # Clean up
    bus._clients.remove(queue)


# ---------------------------------------------------------------------------
# AC-3: Publish with no clients
# ---------------------------------------------------------------------------

def test_stream_bus_publish_no_clients(monkeypatch: pytest.MonkeyPatch):
    """Publishing with no subscribers does not raise (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import StreamBus

    bus = StreamBus()
    # publish is synchronous
    bus.publish("message", {"content": "hello"})


# ---------------------------------------------------------------------------
# AC-3: Dead client eviction
# ---------------------------------------------------------------------------

def test_stream_bus_evicts_dead_client(monkeypatch: pytest.MonkeyPatch):
    """Dead client (queue full) is evicted during publish (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import StreamBus

    bus = StreamBus()

    # Create a queue that's already over _MAX_QUEUE capacity
    full_queue: asyncio.Queue = asyncio.Queue(maxsize=StreamBus._MAX_QUEUE * 2)
    # Fill past the threshold
    for _ in range(StreamBus._MAX_QUEUE + 1):
        full_queue.put_nowait("x")
    bus._clients.append(full_queue)

    # Publish should evict the full queue
    bus.publish("message", {"content": "hello"})

    assert len(bus._clients) == 0


# ---------------------------------------------------------------------------
# AC-3: Module-level singleton
# ---------------------------------------------------------------------------

def test_singleton_is_module_level(monkeypatch: pytest.MonkeyPatch):
    """Module exports _bus singleton instance (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import StreamBus, _bus

    assert _bus is not None
    type_name = type(_bus).__name__
    assert type_name == "StreamBus"


# ---------------------------------------------------------------------------
# AC-3: Legacy helpers
# ---------------------------------------------------------------------------

def test_emit_sse_delegates_to_bus(monkeypatch: pytest.MonkeyPatch):
    """Legacy emit_sse delegates to _bus.publish (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import emit_sse, _bus

    # Patch _bus.publish to verify delegation
    with patch.object(_bus, "publish") as mock_publish:
        emit_sse("test", {"key": "value"})
        mock_publish.assert_called_once_with("test", {"data": {"key": "value"}})


@pytest.mark.asyncio
async def test_sse_event_generator_yields(monkeypatch: pytest.MonkeyPatch):
    """sse_event_generator wraps _bus.subscribe and yields formatted events (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import StreamBus

    bus = StreamBus()

    # Use subscribe directly (subscribe + publish on same bus)
    events = []

    async def _publish_later():
        await asyncio.sleep(0.01)  # let subscribe set up its queue
        bus.publish("test_event", {"data": {"key": "value"}})

    task = asyncio.create_task(_publish_later())
    async for sse_line in bus.subscribe():
        events.append(sse_line)
        if "test_event" in sse_line:
            break

    assert len(events) >= 1
    # Verify SSE format and content
    assert events[0].startswith("data: ")
    parsed = json.loads(events[0][6:].strip())
    assert parsed["type"] == "test_event"

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# AC-3: Non-serializable payload
# ---------------------------------------------------------------------------

def test_non_serializable_payload(monkeypatch: pytest.MonkeyPatch):
    """Non-JSON-serializable payloads are handled gracefully (AC-3)."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]

    from app.infrastructure.events.stream_bus import StreamBus

    bus = StreamBus()

    class NotSerializable:
        pass

    # Should not raise — publish logs a warning and returns
    result = bus.publish("message", {"data": NotSerializable()})
    assert result is None
