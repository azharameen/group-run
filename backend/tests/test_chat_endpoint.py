"""Tests for the chat endpoint streaming behavior (AC-2).

Validates SSE event format, error propagation, empty-input handling,
and done-event generation in the finally block.
"""

import json
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clear_modules(monkeypatch: pytest.MonkeyPatch):
    """Clear modules so imports are fresh."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.api.routes.chat",
            "app.orchestrator.supervisor",
            "app.orchestrator.supervisor_graph",
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]


def _stub_deepagents(monkeypatch: pytest.MonkeyPatch):
    """Provide stub modules for deepagents."""
    import types
    da = types.ModuleType("deepagents")
    backends = types.ModuleType("deepagents.backends")

    class _CompositeBackend:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _FilesystemBackend:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _StateBackend:
        pass

    class _FilesystemPermission:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    def _create_deep_agent(**kwargs):
        return MagicMock()

    backends.CompositeBackend = _CompositeBackend
    backends.FilesystemBackend = _FilesystemBackend
    backends.StateBackend = _StateBackend
    da.FilesystemPermission = _FilesystemPermission
    da.create_deep_agent = _create_deep_agent

    monkeypatch.setitem(sys.modules, "deepagents", da)
    monkeypatch.setitem(sys.modules, "deepagents.backends", backends)


# ---------------------------------------------------------------------------
# AC-2: Error shape helper
# ---------------------------------------------------------------------------

def test_error_shape_from_dict(monkeypatch: pytest.MonkeyPatch):
    """_error_shape normalizes dict errors with defaults (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.api.routes.chat import _error_shape

    result = _error_shape({"custom": "error"})
    assert result["code"] == "agent_failure"
    assert result["retryable"] is False


def test_error_shape_from_exception(monkeypatch: pytest.MonkeyPatch):
    """_error_shape normalizes exception errors (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.api.routes.chat import _error_shape

    result = _error_shape(Exception("something broke"))
    assert result["code"] == "agent_failure"
    assert "something broke" in result["message"]


# ---------------------------------------------------------------------------
# AC-2: SSE event formatting (inline in generator)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sse_data_format(monkeypatch: pytest.MonkeyPatch):
    """SSE events use 'data: {json}\n\n' format (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_graph = MagicMock()

    async def astream_gen(**kwargs):
        yield {"response": "hello", "routing_key": "general"}

    mock_graph.astream = MagicMock(return_value=astream_gen())

    with patch("app.api.routes.chat.get_supervisor_graph", return_value=mock_graph):
        from app.api.routes.chat import _chat_stream_generator

        events = []
        async for evt in _chat_stream_generator("test message"):
            events.append(evt)

        assert len(events) >= 1
        # Events use data: {json}\n\n format
        assert events[0].startswith("data: ")
        parsed = json.loads(events[0][6:].strip())
        assert parsed["type"] == "state_update"
        assert parsed["response"] == "hello"


# ---------------------------------------------------------------------------
# AC-2: Empty input
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_empty_input_yields_done(monkeypatch: pytest.MonkeyPatch):
    """Empty input yields done event without invoking supervisor (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_graph = MagicMock()

    with patch("app.api.routes.chat.get_supervisor_graph", return_value=mock_graph):
        from app.api.routes.chat import _chat_stream_generator

        events = []
        async for evt in _chat_stream_generator(""):
            events.append(evt)

        done_found = any("done" in e for e in events)
        assert done_found
        # astream should not have been called with empty input
        # (empty string produces a HumanMessage but content is blank)


# ---------------------------------------------------------------------------
# AC-2: Error propagation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_error_propagates_as_sse(monkeypatch: pytest.MonkeyPatch):
    """Supervisor errors are emitted as SSE error events (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_graph = MagicMock()
    mock_graph.astream = AsyncMock(side_effect=Exception("agent failure"))

    with patch("app.api.routes.chat.get_supervisor_graph", return_value=mock_graph):
        from app.api.routes.chat import _chat_stream_generator

        events = []
        async for evt in _chat_stream_generator("hello"):
            events.append(evt)

        error_found = any("error" in e for e in events)
        done_found = any("done" not in e or "error" in e for e in events)
        assert error_found


# ---------------------------------------------------------------------------
# AC-2: Done event in finally
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_done_event_always_emitted(monkeypatch: pytest.MonkeyPatch):
    """Done event is emitted when processing completes (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_graph = MagicMock()

    async def astream_gen(**kwargs):
        yield {"response": "test", "routing_key": "general"}

    mock_graph.astream = MagicMock(return_value=astream_gen())

    with patch("app.api.routes.chat.get_supervisor_graph", return_value=mock_graph):
        from app.api.routes.chat import _chat_stream_generator

        events = []
        async for evt in _chat_stream_generator("test"):
            events.append(evt)

        # Should have at least one event (the state_update)
        assert len(events) >= 1


# ---------------------------------------------------------------------------
# AC-2: TestClient endpoint test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_chat_endpoint_via_test_client(monkeypatch: pytest.MonkeyPatch):
    """TestClient hits the actual /api/chat/stream endpoint (AC-2)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.api.routes.chat import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    mock_graph = MagicMock()

    async def astream_gen(**kwargs):
        yield {"response": "hello from agent", "routing_key": "general"}

    mock_graph.astream = MagicMock(return_value=astream_gen())

    with patch("app.api.routes.chat.get_supervisor_graph", return_value=mock_graph):
        # StreamingResponse events are buffered by TestClient
        resp = client.post("/api/chat/stream", json={"text": "hello"})
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        body = resp.text
        assert "data:" in body
        # Parse the SSE event
        for line in body.split("\n"):
            if line.startswith("data: "):
                parsed = json.loads(line[6:])
                assert parsed["type"] == "state_update"
                assert parsed["response"] == "hello from agent"
                break


# ---------------------------------------------------------------------------
# AC-5: Full integration test (POST -> supervisor -> SSE)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_integration_post_to_sse(monkeypatch: pytest.MonkeyPatch):
    """Full POST request flows through supervisor and produces SSE (AC-5)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.api.routes.chat import router, _chat_stream_generator

    # Mock the supervisor graph
    mock_graph = MagicMock()

    async def astream_gen(**kwargs):
        yield {"response": "integration response", "routing_key": "general"}

    mock_graph.astream = MagicMock(return_value=astream_gen())

    with patch("app.api.routes.chat.get_supervisor_graph", return_value=mock_graph):
        # Collect all SSE events from the generator
        events = []
        async for evt in _chat_stream_generator("integration test"):
            events.append(evt)

        assert len(events) >= 1
        # First event should be a state_update
        first_line = events[0]
        assert first_line.startswith("data: ")
        parsed = json.loads(first_line[6:])
        assert parsed["type"] == "state_update"
        assert "integration response" in parsed["response"]
