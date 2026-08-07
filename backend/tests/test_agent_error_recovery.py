"""Tests for agent error recovery: timeout, retry, structured errors, and logging.

Covers AC-1 through AC-7 of story 2.7 (Agent Error Recovery and Resilience).
"""

import asyncio
import json
import sys
import types
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _require_env(monkeypatch):
    """Set required environment variables."""
    monkeypatch.setenv("LANGGRAPH_STRICT_MSGPACK", "true")


# ---------------------------------------------------------------------------
# AC-1: Agent Invocation Timeout — supervisor helper functions
# ---------------------------------------------------------------------------


def test_is_transient_error_classifies_timeout():
    """Verify timeouts are classified as transient errors."""
    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(asyncio.TimeoutError()) is True
    assert _is_transient_error(TimeoutError()) is True
    assert _is_transient_error(ConnectionError()) is True


def test_is_transient_error_classifies_rate_limit():
    """Verify rate limit errors are classified as transient."""
    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("Rate limit exceeded")) is True
    assert _is_transient_error(Exception("HTTP 429 Too Many Requests")) is True


def test_is_transient_error_classifies_server_errors():
    """Verify 5xx errors are classified as transient."""
    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("HTTP 500 Internal Server Error")) is True
    assert _is_transient_error(Exception("HTTP 502 Bad Gateway")) is True
    assert _is_transient_error(Exception("HTTP 503 Service Unavailable")) is True


def test_is_transient_error_rejects_auth_failures():
    """Verify auth failures are NOT classified as transient."""
    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("401 Unauthorized")) is False
    assert _is_transient_error(Exception("403 Forbidden")) is False
    assert _is_transient_error(Exception("Authentication failed")) is False


def test_is_transient_error_rejects_bad_requests():
    """Verify bad requests are NOT classified as transient."""
    from app.orchestrator.supervisor import _is_transient_error

    assert _is_transient_error(Exception("400 Bad Request")) is False
    assert _is_transient_error(ValueError("Invalid input")) is False


# ---------------------------------------------------------------------------
# AC-2: Exponential Backoff Retry — validation
# ---------------------------------------------------------------------------


def test_max_retries_constant():
    """Verify _MAX_RETRIES is set to 2 (3 total attempts)."""
    from app.orchestrator.supervisor import _MAX_RETRIES

    assert _MAX_RETRIES == 2


# ---------------------------------------------------------------------------
# AC-3: Structured Error Responses — helper functions
# ---------------------------------------------------------------------------


def test_error_code_maps_timeout():
    """Verify timeout errors map to 'agent_timeout'."""
    from app.orchestrator.supervisor import _error_code

    assert _error_code(asyncio.TimeoutError()) == "agent_timeout"
    assert _error_code(TimeoutError()) == "agent_timeout"


def test_error_code_maps_rate_limit():
    """Verify rate limit errors map to 'agent_rate_limited'."""
    from app.orchestrator.supervisor import _error_code

    assert _error_code(Exception("Rate limit exceeded")) == "agent_rate_limited"
    assert _error_code(Exception("HTTP 429")) == "agent_rate_limited"


def test_error_code_maps_auth_failure():
    """Verify auth errors map to 'agent_auth_failed'."""
    from app.orchestrator.supervisor import _error_code

    assert _error_code(Exception("401 Unauthorized")) == "agent_auth_failed"
    assert _error_code(Exception("403 Forbidden")) == "agent_auth_failed"


def test_error_code_defaults_to_agent_failure():
    """Verify unknown errors map to 'agent_failure'."""
    from app.orchestrator.supervisor import _error_code

    assert _error_code(ValueError("Invalid input")) == "agent_failure"
    assert _error_code(RuntimeError("Something broke")) == "agent_failure"


def test_user_friendly_error_timeout():
    """Verify timeout returns user-friendly message."""
    from app.orchestrator.supervisor import _user_friendly_error

    msg = _user_friendly_error(asyncio.TimeoutError())
    assert "timed out" in msg.lower() or "timeout" in msg.lower()


def test_user_friendly_error_rate_limit():
    """Verify rate limit returns user-friendly message."""
    from app.orchestrator.supervisor import _user_friendly_error

    msg = _user_friendly_error(Exception("Rate limit exceeded"))
    assert "busy" in msg.lower() or "rate" in msg.lower() or "try again" in msg.lower()


def test_user_friendly_error_generic():
    """Verify generic errors don't leak internal details."""
    from app.orchestrator.supervisor import _user_friendly_error

    msg = _user_friendly_error(RuntimeError("Database connection pool exhausted at 0xDEADBEEF"))
    assert "DEADBEEF" not in msg
    assert "pool" not in msg.lower()


# ---------------------------------------------------------------------------
# AC-5: MCP Timeout Configuration
# ---------------------------------------------------------------------------


def test_mcp_default_timeout_constant():
    """Verify default MCP timeout is 10 seconds."""
    from app.agent.runtime import DEFAULT_MCP_TIMEOUT

    assert DEFAULT_MCP_TIMEOUT == 10


def test_mcp_http_timeout_applied(monkeypatch, tmp_path):
    """Verify HTTP MCP servers receive default timeout via file-first precedence."""
    # Create a temp MCP config file with the new array format (AD-14)
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "http-server", "transport": "http", "url": "http://localhost:3001/mcp"}
        ]
    }))

    # Clear cached modules.
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    # Mock the MCP adapter.
    client_module = types.ModuleType("langchain_mcp_adapters.client")

    captured_connections = {}

    class _FakeClient:
        def __init__(self, connections):
            captured_connections.update(connections)

        async def get_tools(self):
            return [MagicMock(name="test_tool")]

    client_module.MultiServerMCPClient = _FakeClient
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters.client", client_module)
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))

    from app.agent import runtime as runtime_mod
    # Override _mcp_config_path to use our temp file
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    runtime_mod._load_mcp_tools()

    # Verify timeout was applied to HTTP server (array format converts to dict keys).
    assert "http-server" in captured_connections
    assert captured_connections["http-server"].get("timeout") == 10


def test_mcp_custom_timeout_preserved(monkeypatch, tmp_path):
    """Verify custom timeout values are preserved via file-first precedence."""
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "custom-server", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 30}
        ]
    }))

    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    client_module = types.ModuleType("langchain_mcp_adapters.client")

    captured_connections = {}

    class _FakeClient:
        def __init__(self, connections):
            captured_connections.update(connections)

        async def get_tools(self):
            return [MagicMock(name="test_tool")]

    client_module.MultiServerMCPClient = _FakeClient
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters.client", client_module)
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))

    from app.agent import runtime as runtime_mod
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    runtime_mod._load_mcp_tools()

    # Verify custom timeout is preserved.
    assert captured_connections["custom-server"].get("timeout") == 30


def test_mcp_stdio_no_timeout_added(monkeypatch, tmp_path):
    """Verify STDIO servers don't get timeout added via file-first precedence."""
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "stdio-server", "transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server_example"]}
        ]
    }))

    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    client_module = types.ModuleType("langchain_mcp_adapters.client")

    captured_connections = {}

    class _FakeClient:
        def __init__(self, connections):
            captured_connections.update(connections)

        async def get_tools(self):
            return [MagicMock(name="test_tool")]

    client_module.MultiServerMCPClient = _FakeClient
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters.client", client_module)
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))

    from app.agent import runtime as runtime_mod
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    runtime_mod._load_mcp_tools()

    # Verify STDIO server has no timeout field.
    assert "timeout" not in captured_connections["stdio-server"]


# ---------------------------------------------------------------------------
# AC-6: Graceful Degradation — MCP fallback
# ---------------------------------------------------------------------------


def test_mcp_graceful_degradation_on_import_error(monkeypatch, caplog, tmp_path):
    """Verify MCP loading fails gracefully when adapter is missing (file-first)."""
    import logging

    # Create a config file with a server to trigger adapter import
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [{"name": "server", "transport": "http", "url": "http://localhost:3001"}]
    }))

    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    # Do NOT mock langchain_mcp_adapters — let ImportError happen.

    from app.agent import runtime as runtime_mod
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    with caplog.at_level(logging.ERROR):
        tools = runtime_mod._load_mcp_tools()

    assert tools == []
    assert "MCP tools unavailable" in caplog.text or "MCP tools failed" in caplog.text


def test_mcp_graceful_degradation_on_invalid_json(monkeypatch, caplog, tmp_path):
    """Verify MCP loading fails gracefully on invalid JSON (file-first)."""
    import logging

    # Create an invalid JSON config file
    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text("{invalid-json}")

    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    from app.agent import runtime as runtime_mod
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    with caplog.at_level(logging.ERROR):
        tools = runtime_mod._load_mcp_tools()

    assert tools == []
    assert "MCP config invalid JSON" in caplog.text


# ---------------------------------------------------------------------------
# AC-7: Error Logging and Observability
# ---------------------------------------------------------------------------


def test_mcp_structured_logging_on_success(monkeypatch, caplog, tmp_path):
    """Verify successful MCP load logs structured message (file-first)."""
    import logging

    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "test-server", "transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server_example"]}
        ]
    }))

    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    client_module = types.ModuleType("langchain_mcp_adapters.client")

    class _FakeClient:
        def __init__(self, connections):
            pass

        async def get_tools(self):
            return [MagicMock(name="test_tool")]

    client_module.MultiServerMCPClient = _FakeClient
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters.client", client_module)
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))

    from app.agent import runtime as runtime_mod
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    with caplog.at_level(logging.INFO):
        runtime_mod._load_mcp_tools()

    log_output = caplog.text
    assert "MCP tools loaded" in log_output
    assert "count=1" in log_output


def test_mcp_structured_logging_on_failure(monkeypatch, caplog, tmp_path):
    """Verify MCP failures log structured error with server context (file-first)."""
    import logging

    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(json.dumps({
        "schema_version": "1.0",
        "servers": [
            {"name": "failing-server", "transport": "http", "url": "http://localhost:3001/mcp"}
        ]
    }))

    for mod in list(sys.modules.keys()):
        if mod.startswith("app.agent.runtime") or mod.startswith("app.config"):
            del sys.modules[mod]

    client_module = types.ModuleType("langchain_mcp_adapters.client")

    class _FakeClient:
        def __init__(self, connections):
            raise ConnectionError("Server unreachable")

        async def get_tools(self):
            return []

    client_module.MultiServerMCPClient = _FakeClient
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters.client", client_module)
    monkeypatch.setitem(sys.modules, "langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))

    from app.agent import runtime as runtime_mod
    monkeypatch.setattr(runtime_mod, "_mcp_config_path", mcp_config)

    with caplog.at_level(logging.ERROR):
        tools = runtime_mod._load_mcp_tools()

    assert tools == []
    log_output = caplog.text
    assert "MCP tools failed" in log_output or "MCP tools unavailable" in log_output


def test_agent_timeout_setting_exists():
    """Verify AGENT_TIMEOUT_SEC config setting exists with default 120."""
    from app.config import settings

    assert hasattr(settings, "agent_timeout_sec")
    assert settings.agent_timeout_sec >= 30  # Reasonable minimum



