"""Tests for Story 8.4 interrupt persistence in the supervisor.

Verifies that ``supervisor_general`` detects a ``__interrupt__`` in the agent
result and persists it via ``InterruptService.create_interrupt`` with full
provenance, returning a ``waiting_for_approval=True`` state.
"""

import importlib
import sys
import types
from typing import ClassVar
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage


def _clear_modules(monkeypatch: pytest.MonkeyPatch):
    """Clear supervisor and runtime modules so imports are fresh."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.orchestrator.supervisor",
            "app.agent.runtime",
            "app.config",
        )):
            del sys.modules[mod]
    import app
    app.__dict__.pop("orchestrator", None)


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


def _interrupt_result():
    """Build an agent result dict with a __interrupt__ key."""
    class _Interrupt:
        value: ClassVar = {"action_requests": [{"name": "write_file", "args": {"path": "x.txt"}}]}

    return {"__interrupt__": [_Interrupt()]}


@pytest.mark.asyncio
async def test_supervisor_persists_interrupt(monkeypatch):
    """supervisor_general detects __interrupt__ and persists it."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_agent = AsyncMock()
    mock_agent.ainvoke = AsyncMock(return_value=_interrupt_result())

    sup_mod = importlib.import_module("app.orchestrator.supervisor")
    supervisor_general = sup_mod.supervisor_general

    sup_mod._agent = mock_agent

    created = {}
    def fake_create(thread_id, tool_name, message, tool_input, decided_by, confidence, alternatives):
        created.update({
            "thread_id": thread_id,
            "tool_name": tool_name,
            "message": message,
            "tool_input": tool_input,
            "decided_by": decided_by,
            "confidence": confidence,
            "alternatives": alternatives,
        })
        return {"id": "interrupt-1", "status": "pending"}

    with patch("app.services.interrupt_service.InterruptService.instance") as mock_instance:
        mock_instance.return_value.create_interrupt.side_effect = fake_create
        state = {"messages": [HumanMessage(content="write a file")], "configurable": {"thread_id": "thread-1"}}
        result = await supervisor_general(state)

    assert result["waiting_for_approval"] is True
    assert result["routing_key"] == "general"
    assert created["thread_id"] == "thread-1"
    assert created["tool_name"] == "write_file"
    assert created["decided_by"] == "agent"
    assert created["confidence"] == "low"
    assert created["alternatives"] == ["approve", "reject"]
    assert created["tool_input"] == {"path": "x.txt"}


@pytest.mark.asyncio
async def test_supervisor_no_interrupt_returns_response(monkeypatch):
    """Without __interrupt__, supervisor returns the agent response."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    mock_agent = AsyncMock()
    mock_agent.ainvoke = AsyncMock(return_value={"output": "hello"})

    sup_mod = importlib.import_module("app.orchestrator.supervisor")
    supervisor_general = sup_mod.supervisor_general

    sup_mod._agent = mock_agent

    state = {"messages": [HumanMessage(content="hi")], "configurable": {"thread_id": "thread-1"}}
    result = await supervisor_general(state)

    assert result["response"] == "hello"
    assert "waiting_for_approval" not in result
