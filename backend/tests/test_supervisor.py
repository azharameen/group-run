"""Tests for the LangGraph supervisor graph (AC-1).

Covers SupervisorState shape, supervisor_general node behavior,
error classification (transient vs. non-transient), retry logic,
structured error codes, and graph caching.
"""

import asyncio
import sys
import types
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from langchain_core.messages import HumanMessage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clear_modules(monkeypatch: pytest.MonkeyPatch):
    """Clear supervisor and runtime modules so imports are fresh."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.orchestrator.supervisor",
            "app.agent.runtime",
            "app.config",
        )):
            del sys.modules[mod]


def _stub_deepagents(monkeypatch: pytest.MonkeyPatch):
    """Provide stub modules for deepagents so supervisor imports succeed."""
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
# AC-1: SupervisorState shape
# ---------------------------------------------------------------------------

def test_supervisor_state_fields(monkeypatch: pytest.MonkeyPatch):
    """SupervisorState TypedDict contains required keys (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import SupervisorState

    state: SupervisorState = {
        "messages": [],
        "response": "",
        "error": "",
        "routing_key": "general",
    }
    assert "messages" in state
    assert "response" in state
    assert "error" in state
    assert "routing_key" in state


# ---------------------------------------------------------------------------
# AC-1: supervisor_general node
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_supervisor_general_no_human_message(monkeypatch: pytest.MonkeyPatch):
    """Empty messages list returns empty response without invoking agent (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import supervisor_general

    state: dict = {"messages": []}
    result = await supervisor_general(state)

    assert result["response"] == ""
    assert result["routing_key"] == "general"


@pytest.mark.asyncio
async def test_supervisor_general_empty_content(monkeypatch: pytest.MonkeyPatch):
    """HumanMessage with empty content returns empty response (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import supervisor_general

    state: dict = {"messages": [HumanMessage(content="   ")]}
    result = await supervisor_general(state)

    assert result["response"] == ""
    assert result["routing_key"] == "general"


@pytest.mark.asyncio
async def test_supervisor_general_valid_message(monkeypatch: pytest.MonkeyPatch):
    """Valid HumanMessage invokes agent and returns response (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_agent = AsyncMock()
    mock_agent.ainvoke = AsyncMock(return_value={"output": "test response"})

    from app.orchestrator.supervisor import supervisor_general
    from app.orchestrator import supervisor as sup_mod
    sup_mod._agent = mock_agent

    state: dict = {"messages": [HumanMessage(content="hello")]}
    result = await supervisor_general(state)

    assert result["response"] == "test response"
    assert result["routing_key"] == "general"
    mock_agent.ainvoke.assert_awaited_once()


# ---------------------------------------------------------------------------
# AC-1: Error classification
# ---------------------------------------------------------------------------

def test_transient_error_timeout(monkeypatch: pytest.MonkeyPatch):
    """TimeoutError is classified as transient (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(asyncio.TimeoutError()) is True
    assert _is_transient_error(TimeoutError()) is True
    assert _is_transient_error(ConnectionError()) is True


def test_transient_error_rate_limit(monkeypatch: pytest.MonkeyPatch):
    """Rate limit errors are classified as transient (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("429 Too Many Requests")) is True
    assert _is_transient_error(Exception("rate limit exceeded")) is True


def test_transient_error_server_error(monkeypatch: pytest.MonkeyPatch):
    """5xx errors are classified as transient (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("500 Internal Server Error")) is True
    assert _is_transient_error(Exception("503 Service Unavailable")) is True


def test_non_transient_error_auth(monkeypatch: pytest.MonkeyPatch):
    """Auth failures are NOT transient (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("401 Unauthorized")) is False
    assert _is_transient_error(Exception("403 Forbidden")) is False
    assert _is_transient_error(Exception("400 Bad Request")) is False


# ---------------------------------------------------------------------------
# AC-1: Error codes
# ---------------------------------------------------------------------------

def test_error_code_timeout(monkeypatch: pytest.MonkeyPatch):
    """Timeout errors map to agent_timeout code (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _error_code

    assert _error_code(asyncio.TimeoutError()) == "agent_timeout"


def test_error_code_rate_limit(monkeypatch: pytest.MonkeyPatch):
    """Rate limit errors map to agent_rate_limited code (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _error_code

    assert _error_code(Exception("429 rate limit")) == "agent_rate_limited"


def test_error_code_auth(monkeypatch: pytest.MonkeyPatch):
    """Auth errors map to agent_auth_failed code (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _error_code

    assert _error_code(Exception("401 unauthorized")) == "agent_auth_failed"


def test_error_code_generic(monkeypatch: pytest.MonkeyPatch):
    """Generic errors map to agent_failure code (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _error_code

    assert _error_code(Exception("something broke")) == "agent_failure"


# ---------------------------------------------------------------------------
# AC-1: User-friendly error messages
# ---------------------------------------------------------------------------

def test_user_friendly_error_timeout(monkeypatch: pytest.MonkeyPatch):
    """Timeout returns user-friendly timeout message (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _user_friendly_error

    msg = _user_friendly_error(asyncio.TimeoutError())
    assert "timed out" in msg.lower() or "timeout" in msg.lower()


def test_user_friendly_error_rate_limit(monkeypatch: pytest.MonkeyPatch):
    """Rate limit returns user-friendly busy message (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.supervisor import _user_friendly_error

    msg = _user_friendly_error(Exception("429 rate limit"))
    assert "busy" in msg.lower() or "rate" in msg.lower() or "try again" in msg.lower()


# ---------------------------------------------------------------------------
# AC-1: Graph caching
# ---------------------------------------------------------------------------

@pytest.mark.xfail(reason="Test isolation issue - async event loop and singleton state pollute other tests in full suite", strict=False)
def test_supervisor_graph_caching(monkeypatch: pytest.MonkeyPatch):
    """get_supervisor_graph returns cached instance (AC-1)."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    # Patch get_async_checkpointer to avoid needing async event loop
    fake_checkpointer = Mock()
    monkeypatch.setattr("app.orchestrator.supervisor.get_async_checkpointer", lambda: fake_checkpointer)
    with patch("langgraph.graph.StateGraph.compile", return_value=Mock()):
        from app.orchestrator.supervisor import get_supervisor_graph

        graph1 = get_supervisor_graph()
        graph2 = get_supervisor_graph()

        assert graph1 is graph2
