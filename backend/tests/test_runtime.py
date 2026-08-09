"""Tests for DeepAgents runtime factory (MCP loading, timeouts, and logging)."""

import json
import sys
import types
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _require_langgraph_env(monkeypatch):
    """Set required environment variables for test execution."""
    monkeypatch.setenv("LANGGRAPH_STRICT_MSGPACK", "true")


def _clear_runtime_modules(monkeypatch):
    """Clear cached runtime and config modules so env vars are picked up fresh."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]


@pytest.fixture
def _mock_mcp_adapter(monkeypatch):
    """Provide a stub langchain_mcp_adapters.client module."""
    client_module = types.ModuleType("langchain_mcp_adapters.client")

    class _FakeClient:
        def __init__(self, connections):
            self.connections = connections

        async def get_tools(self):
            tools = []
            for server_name, config in self.connections.items():
                timeout = config.get("timeout", "<not-set>")
                tools.append(
                    MagicMock(name=f"{server_name}_tool", timeout=timeout)
                )
            return tools

    client_module.MultiServerMCPClient = _FakeClient
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters.client", client_module)
    return client_module


@pytest.fixture
def _mock_modules(monkeypatch):
    """Provide stub modules for deepagents and langgraph dependencies."""
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


def test_mcp_http_timeout_configuration(monkeypatch, _mock_mcp_adapter, _mock_modules, tmp_path):
    """Verify that HTTP MCP servers receive a default 10-second timeout (AC-5, file-first)."""
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [{"name": "http-server", "transport": "http", "url": "http://localhost:3001/mcp"}]
    }))

    from app.agent import runtime as runtime_mod
    import app.config as config_mod

    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(mcp_config))
    monkeypatch.setattr(runtime_mod, "_config", config_mod)

    tools = runtime_mod._load_mcp_tools()
    assert len(tools) == 1
    # The stub tool echoes back the timeout value applied by _load_mcp_tools.
    assert tools[0].timeout == 10


def test_mcp_structured_logging(monkeypatch, _mock_mcp_adapter, _mock_modules, caplog, tmp_path):
    """Validate structured logging output for MCP operations (AC-7, file-first)."""
    import logging

    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "test-server", "transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server_example"]}
        ]
    }))

    from app.agent import runtime as runtime_mod
    import app.config as config_mod

    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(mcp_config))
    monkeypatch.setattr(runtime_mod, "_config", config_mod)

    with caplog.at_level(logging.INFO):
        tools = runtime_mod._load_mcp_tools()

    assert len(tools) == 1
    # Verify structured log message includes tool count and server name.
    log_output = caplog.text
    assert "count=1" in log_output
    assert "test-server" in log_output


def test_mcp_resilient_loading_on_failure(monkeypatch, _mock_modules):
    """Ensure MCP loading failures return an empty list without crashing (AC-5)."""
    # Simulate langchain_mcp_adapters missing (ImportError).
    if "langchain_mcp_adapters" in sys.modules:
        del sys.modules["langchain_mcp_adapters"]
    if "langchain_mcp_adapters.client" in sys.modules:
        del sys.modules["langchain_mcp_adapters.client"]

    monkeypatch.setenv("MCP_SERVERS", json.dumps({
        "failing-server": {
            "transport": "http",
            "url": "http://localhost:3001/mcp",
        }
    }))

    from app.agent.runtime import _load_mcp_tools

    tools = _load_mcp_tools()
    assert tools == []


def test_mcp_invalid_json_configuration(monkeypatch, _mock_modules, caplog, tmp_path):
    """Verify graceful handling of invalid MCP config JSON (file-first)."""
    import logging

    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text("{invalid-json}")

    from app.agent import runtime as runtime_mod
    import app.config as config_mod

    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(mcp_config))
    monkeypatch.setattr(runtime_mod, "_config", config_mod)

    with caplog.at_level(logging.ERROR):
        tools = runtime_mod._load_mcp_tools()

    assert tools == []
    assert "MCP config invalid JSON" in caplog.text


def test_mcp_empty_configuration_returns_empty(monkeypatch, _mock_modules):
    """Ensure empty MCP configuration returns an empty tool list."""
    monkeypatch.setenv("MCP_SERVERS", "{}")

    from app.agent.runtime import _load_mcp_tools

    tools = _load_mcp_tools()
    assert tools == []


def test_mcp_custom_timeout_preserved(monkeypatch, _mock_mcp_adapter, _mock_modules, tmp_path):
    """Verify custom timeout values are preserved for HTTP MCP servers (file-first)."""
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "custom-timeout-server", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 30}
        ]
    }))

    from app.agent import runtime as runtime_mod
    import app.config as config_mod

    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(mcp_config))
    monkeypatch.setattr(runtime_mod, "_config", config_mod)

    tools = runtime_mod._load_mcp_tools()
    assert len(tools) == 1
    assert tools[0].timeout == 30

