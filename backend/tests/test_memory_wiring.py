"""Test suite for verifying memory wiring in DeepAgents runtime."""

import sys
import types
from unittest.mock import MagicMock

import pytest

def test_memory_wiring_in_runtime(monkeypatch):
    """Verify that 'memories' parameter is passed to create_deep_agent in runtime factory."""
    # Mock deepagents and related modules
    deepagents_module = types.ModuleType("deepagents")
    backends_module = types.ModuleType("deepagents.backends")
    middleware_module = types.ModuleType("deepagents.middleware")
    skills_middleware_module = types.ModuleType("deepagents.middleware.skills")
    memory_middleware_module = types.ModuleType("deepagents.middleware.memory")
    
    # Capture kwargs passed to create_deep_agent
    captured_kwargs = {}
    def mock_create_deep_agent(**kwargs):
        captured_kwargs.update(kwargs)
        return MagicMock()

    deepagents_module.create_deep_agent = mock_create_deep_agent
    deepagents_module.DeepAgentState = MagicMock()
    
    # Mock backends
    backends_module.CompositeBackend = MagicMock()
    backends_module.FilesystemBackend = MagicMock()
    backends_module.StateBackend = MagicMock()
    
    # Mock middleware
    skills_middleware_module.SkillsMiddleware = MagicMock()
    memory_middleware_module.MemoryMiddleware = MagicMock()

    monkeypatch.setitem(sys.modules, "deepagents", deepagents_module)
    monkeypatch.setitem(sys.modules, "deepagents.backends", backends_module)
    monkeypatch.setitem(sys.modules, "deepagents.middleware", middleware_module)
    monkeypatch.setitem(sys.modules, "deepagents.middleware.skills", skills_middleware_module)
    monkeypatch.setitem(sys.modules, "deepagents.middleware.memory", memory_middleware_module)
    
    # Mock dependencies of runtime.py
    monkeypatch.setitem(sys.modules, "langgraph.checkpoint.sqlite", MagicMock())
    
    # Mock thread_manager to avoid DB and module import issues
    thread_manager_module = types.ModuleType("app.services.thread_manager")
    thread_manager_module.get_checkpointer = MagicMock(return_value=MagicMock())
    monkeypatch.setitem(sys.modules, "app.services.thread_manager", thread_manager_module)
    
    # Mock other sub-modules
    app_agent_backends = types.ModuleType("app.agent.backends")
    app_agent_backends.build_agent_backend = MagicMock()
    monkeypatch.setitem(sys.modules, "app.agent.backends", app_agent_backends)
    monkeypatch.setitem(sys.modules, "app.agent.permissions", MagicMock())
    monkeypatch.setitem(sys.modules, "app.agent.context", MagicMock())

    from app.agent.runtime import get_deep_agent_runtime
    from app.config import settings
    
    # Ensure model is set
    original_model = settings.deepagents_model
    settings.deepagents_model = "openai:test-model"
    
    try:
        # Mock _load_mcp_tools to avoid actual MCP loading
        import app.agent.runtime as runtime_mod
        monkeypatch.setattr(runtime_mod, "_load_mcp_tools", lambda: [])
        
        get_deep_agent_runtime()
        
        # Verify memories was passed
        assert "memories" in captured_kwargs
        assert captured_kwargs["memories"] == ["/memories/"]
    finally:
        settings.deepagents_model = original_model

def test_memory_wiring_in_subagents(monkeypatch):
    """Verify that 'memories' parameter is added to subagent definitions."""
    from app.agent.subagents import build_agent_subagents
    
    # Mock teams.yaml content
    mock_teams_yaml = """
teams:
  general:
    agents:
      - name: "test-agent"
        role: "tester"
"""
    
    # We need to mock Path.read_text for the TEAMS_CONFIG_PATH
    import app.config as config
    from pathlib import Path
    
    original_read_text = Path.read_text
    def mock_read_text(self, encoding=None):
        if str(self).endswith("teams.yaml"):
            return mock_teams_yaml
        return original_read_text(self, encoding=encoding)
    
    monkeypatch.setattr(Path, "read_text", mock_read_text)
    
    subagents = build_agent_subagents("general")
    
    assert len(subagents) == 1
    assert subagents[0]["name"] == "test-agent"
    assert "memories" in subagents[0]
    assert subagents[0]["memories"] == ["/memories/"]

def test_memory_wiring_null_handling(monkeypatch):
    """Verify that 'memories' defaults correctly even if set to null in YAML."""
    from app.agent.subagents import build_agent_subagents
    from pathlib import Path
    
    mock_teams_yaml = """
teams:
  general:
    agents:
      - name: "null-memory-agent"
        memories: null
"""
    
    original_read_text = Path.read_text
    def mock_read_text(self, encoding=None):
        if str(self).endswith("teams.yaml"):
            return mock_teams_yaml
        return original_read_text(self, encoding=encoding)
    
    monkeypatch.setattr(Path, "read_text", mock_read_text)
    
    subagents = build_agent_subagents("general")
    assert subagents[0]["memories"] == ["/memories/"]
