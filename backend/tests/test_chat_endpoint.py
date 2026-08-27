"""Tests for the chat endpoint streaming behavior (AC-2).

Validates SSE event format, error propagation, done-event generation, and the
provider-model contract of /api/chat/stream (an enabled provider configuration
plus a discovered model is required; selection failures surface as 409).
"""

import json
from contextlib import asynccontextmanager
from typing import Any

import app.api.routes.chat as chat_mod
import pytest
from app.api.app import create_app
from app.providers.adapters import ProviderDefinition
from app.providers.service import ProviderSelectionError
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# NOTE: patches target the `chat_mod` module OBJECT (not dotted strings).
# pytest's string resolution walks parent package attributes, which other
# tests' module purges can leave pointing at orphaned module instances;
# patching the object the routes' globals actually reference is immune.

_DEFINITION = ProviderDefinition("test-provider", "https://api.example.com/v1", {"api_key": "k"})


class _StubProviderService:
    """Provider service double: fixed enabled selection, no-op execution lease."""

    async def resolve_model(self, user_id: str, provider_id: str | None, model_id: str | None):
        return "prov-1", "model-1", _DEFINITION

    @asynccontextmanager
    async def execution(self, user_id: str, provider_id: str):
        yield


def _make_runner(events: list[dict[str, Any]], *, fail: Exception | None = None):
    """Build a fake execute_deep_agent_workflow_streaming with a fixed event list."""

    async def _runner(*args: Any, **kwargs: Any):
        if fail is not None:
            raise fail
        for event in events:
            yield event

    return _runner


# ---------------------------------------------------------------------------
# AC-2: Error shape helper
# ---------------------------------------------------------------------------

def test_error_shape_from_dict():
    """_error_shape normalizes dict errors with defaults (AC-2)."""
    result = chat_mod._error_shape({"custom": "error"})
    assert result["code"] == "agent_failure"
    assert result["retryable"] is False


def test_error_shape_from_exception():
    """_error_shape normalizes exception errors (AC-2)."""
    result = chat_mod._error_shape(Exception("something broke"))
    assert result["code"] == "agent_failure"
    assert "something broke" in result["message"]


# ---------------------------------------------------------------------------
# AC-2: SSE event formatting (inline in generator)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sse_data_format(monkeypatch: pytest.MonkeyPatch):
    """SSE events use 'data: {json}\\n\\n' format (AC-2)."""
    monkeypatch.setattr(
        chat_mod,
        "execute_deep_agent_workflow_streaming",
        _make_runner([{"type": "state_update", "response": "hello", "routing_key": "general"}]),
    )
    monkeypatch.setattr(chat_mod, "provider_service", _StubProviderService())

    events = []
    async for evt in chat_mod._chat_stream_generator(
        "test message", "uid-1", "prov-1", "model-1", _DEFINITION, "thread-1", _StubProviderService()
    ):
        events.append(evt)

    assert len(events) >= 1
    # Events use data: {json}\n\n format
    assert events[0].startswith("data: ")
    parsed = json.loads(events[0][6:].strip())
    assert parsed["type"] == "state_update"
    assert parsed["response"] == "hello"


# ---------------------------------------------------------------------------
# AC-2: Error propagation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_error_propagates_as_sse(monkeypatch: pytest.MonkeyPatch):
    """Runner failures are emitted as SSE error events (AC-2)."""
    monkeypatch.setattr(
        chat_mod,
        "execute_deep_agent_workflow_streaming",
        _make_runner([], fail=Exception("agent failure")),
    )
    monkeypatch.setattr(chat_mod, "provider_service", _StubProviderService())

    events = []
    async for evt in chat_mod._chat_stream_generator(
        "hello", "uid-1", "prov-1", "model-1", _DEFINITION, "thread-1", _StubProviderService()
    ):
        events.append(evt)

    error_found = any("error" in e for e in events)
    assert error_found
    assert events[-1] == 'data: {"type": "done"}\n\n'


# ---------------------------------------------------------------------------
# AC-2: Done event in finally
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_done_event_always_emitted(monkeypatch: pytest.MonkeyPatch):
    """Done event is emitted even when the runner yields no done event (AC-2)."""
    monkeypatch.setattr(
        chat_mod,
        "execute_deep_agent_workflow_streaming",
        _make_runner([{"type": "state_update", "response": "test", "routing_key": "general"}]),
    )
    monkeypatch.setattr(chat_mod, "provider_service", _StubProviderService())

    events = []
    async for evt in chat_mod._chat_stream_generator(
        "hello", "uid-1", "prov-1", "model-1", _DEFINITION, "thread-1", _StubProviderService()
    ):
        events.append(evt)

    assert events[-1] == 'data: {"type": "done"}\n\n'


@pytest.mark.asyncio
async def test_done_emitted_when_runner_yields_nothing(monkeypatch: pytest.MonkeyPatch):
    """An empty runner run still terminates with a single done event (AC-2)."""
    monkeypatch.setattr(
        chat_mod,
        "execute_deep_agent_workflow_streaming",
        _make_runner([]),
    )
    monkeypatch.setattr(chat_mod, "provider_service", _StubProviderService())

    events = []
    async for evt in chat_mod._chat_stream_generator(
        "hello", "uid-1", "prov-1", "model-1", _DEFINITION, "thread-1", _StubProviderService()
    ):
        events.append(evt)

    assert events == ['data: {"type": "done"}\n\n']


# ---------------------------------------------------------------------------
# AC-5: TestClient endpoint test (full app, auth middleware, provider contract)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_chat_endpoint_via_test_client(monkeypatch: pytest.MonkeyPatch, patch_config):
    """TestClient hits the actual /api/chat/stream endpoint (AC-5)."""
    monkeypatch.setattr(chat_mod, "provider_service", _StubProviderService())
    monkeypatch.setattr(
        chat_mod,
        "execute_deep_agent_workflow_streaming",
        _make_runner([{"type": "state_update", "response": "hello from agent", "routing_key": "general"}]),
    )

    with TestClient(create_app()) as client:
        resp = client.post("/api/chat/stream", json={"text": "hello"})
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        body = resp.text
        assert "data:" in body
        # Parse the SSE event
        for line in body.split("\n"):
            if line.startswith("data: "):
                parsed = json.loads(line[6:])
                if parsed.get("type") == "state_update":
                    assert parsed["response"] == "hello from agent"
                    break
        else:
            pytest.fail("no state_update event in stream")


# ---------------------------------------------------------------------------
# AC-6: Provider selection contract
# ---------------------------------------------------------------------------

class _NoSelectionProviderService(_StubProviderService):
    """Service double with no saved/usable provider model for the user."""

    async def resolve_model(self, user_id: str, provider_id: str | None, model_id: str | None):
        raise ProviderSelectionError("Choose an enabled provider model before starting a chat")


@pytest.mark.asyncio
async def test_chat_stream_requires_provider_selection(monkeypatch: pytest.MonkeyPatch, patch_config):
    """Without an enabled provider model, /api/chat/stream returns 409 (AC-6)."""
    monkeypatch.setattr(chat_mod, "provider_service", _NoSelectionProviderService())

    with TestClient(create_app()) as client:
        resp = client.post("/api/chat/stream", json={"text": "hello"})
        assert resp.status_code == 409
        assert "provider" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# NFR-A10: CI/local fallback mode (DEEPAGENTS_MODEL, no per-user providers)
# ---------------------------------------------------------------------------


class _FallbackProviderService:
    """Service double in fallback mode: no user provider configurations exist,
    so resolution returns the environment-model tuple (None, None, None)."""

    async def resolve_model(self, user_id: str, provider_id: str | None, model_id: str | None):
        return None, None, None

    @asynccontextmanager
    async def execution(self, user_id: str, provider_id: str):
        raise AssertionError("execution lease must not be acquired in fallback mode")
        yield  # pragma: no cover


@pytest.mark.asyncio
async def test_fallback_selection_streams_without_lease(monkeypatch: pytest.MonkeyPatch):
    """A (None, None, None) selection streams through the environment model
    and never acquires a provider execution lease (NFR-A10)."""
    runner_calls: list[dict[str, Any]] = []

    async def _runner(*args: Any, **kwargs: Any):
        runner_calls.append(kwargs)
        yield {"type": "state_update", "response": "fallback ok", "routing_key": "general"}

    monkeypatch.setattr(chat_mod, "execute_deep_agent_workflow_streaming", _runner)

    events = []
    async for evt in chat_mod._chat_stream_generator(
        "hello", "uid-1", None, None, None, "thread-1", _FallbackProviderService()
    ):
        events.append(evt)

    assert any('"state_update"' in e for e in events)
    assert runner_calls[0]["provider_id"] == ""
    assert runner_calls[0]["model_id"] == ""
    assert runner_calls[0]["provider_definition"] is None


@pytest.mark.asyncio
async def test_stream_chat_endpoint_fallback_mode_returns_200(
    monkeypatch: pytest.MonkeyPatch, patch_config
):
    """Without a per-user provider, /api/chat/stream uses the DEEPAGENTS_MODEL
    fallback instead of 409 — the E2E warm-up scenario (NFR-A10)."""
    monkeypatch.setattr(chat_mod, "provider_service", _FallbackProviderService())
    monkeypatch.setattr(
        chat_mod,
        "execute_deep_agent_workflow_streaming",
        _make_runner([{"type": "state_update", "response": "fallback ok", "routing_key": "general"}]),
    )

    with TestClient(create_app()) as client:
        resp = client.post("/api/chat/stream", json={"text": "hello"})
        assert resp.status_code == 200
        assert "fallback ok" in resp.text
