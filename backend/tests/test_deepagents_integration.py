"""Integration test suite for DeepAgents runtime and HITL approval endpoints."""

import sys
import types
import os

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
from app.agent.runtime import get_deep_agent_runtime
from app.storage.yaml_io import save_idea_yaml as save_idea, load_idea_yaml as load_idea, create_idea_folder


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_deepagents_runtime_factory(monkeypatch):
    """Verify runtime factory returns a configured runtime when a model is set."""
    from app.config import settings

    settings.deepagents_model = settings.deepagents_model or "openai:test-model"
    deepagents_module = types.ModuleType("deepagents")
    backends_module = types.ModuleType("deepagents.backends")
    checkpoint_module = types.ModuleType("langgraph.checkpoint.memory")

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

    class _InMemorySaver:
        pass

    def _create_deep_agent(**kwargs):
        return types.SimpleNamespace(invoke=lambda payload: {"payload": payload, "kwargs": kwargs})

    backends_module.CompositeBackend = _CompositeBackend
    backends_module.FilesystemBackend = _FilesystemBackend
    backends_module.StateBackend = _StateBackend
    deepagents_module.FilesystemPermission = _FilesystemPermission
    deepagents_module.create_deep_agent = _create_deep_agent
    checkpoint_module.InMemorySaver = _InMemorySaver

    monkeypatch.setitem(sys.modules, "deepagents", deepagents_module)
    monkeypatch.setitem(sys.modules, "deepagents.backends", backends_module)
    monkeypatch.setitem(sys.modules, "langgraph.checkpoint.memory", checkpoint_module)

    runtime = get_deep_agent_runtime()
    assert hasattr(runtime, "invoke")

