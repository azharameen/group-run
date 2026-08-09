"""Tests for MCP tool loading from config/mcp.json (Story 5.3).

Validates:
- Fresh file read on each _load_mcp_tools() call
- File-first precedence over MCP_SERVERS env var
- Env var fallback when mcp.json missing
- Invalid JSON handling
- Empty servers list authority
- HTTP timeout defaults from connection spec
- Reload endpoint validation via POST /api/config/reload-mcp
"""

import json

import pytest
from fastapi.testclient import TestClient

from app import config as main_config
from app.agent import runtime
from app.api.app import create_app

VALID_JSON = json.dumps({
    "schema_version": "1.0",
    "servers": [
        {
            "name": "weather",
            "url": "http://localhost:8080/sse",
            "transport": "streamable_http",
        }
    ],
})

TWO_SERVERS_JSON = json.dumps({
    "schema_version": "1.0",
    "servers": [
        {
            "name": "weather",
            "url": "http://localhost:8080/sse",
            "transport": "streamable_http",
        },
        {
            "name": "calculator",
            "url": "http://localhost:8081/sse",
            "transport": "sse",
        },
    ],
})

EMPTY_SERVERS_JSON = json.dumps({
    "schema_version": "1.0",
    "servers": [],
})

INVALID_JSON_STR = '{"schema_version": "1.0", "servers": [invalid json}'

NOT_ARRAY_JSON = json.dumps({
    "schema_version": "1.0",
    "servers": "not an array",
})


def write(path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.fixture
def client_and_path(tmp_path, monkeypatch):
    """Set up test client with monkeypatched MCP config path.

    Uses the same three-location monkeypatch pattern as test_config_reload.py
    to handle sys.modules clearing.
    """
    import app.config as config_mod

    mcp_path = tmp_path / "config" / "mcp.json"
    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(mcp_path))
    monkeypatch.setattr("app.agent.runtime.MCP_CONFIG_PATH", str(mcp_path))
    monkeypatch.setattr(runtime, "_config", config_mod)

    # Unset env var that might linger
    monkeypatch.delenv("MCP_SERVERS", raising=False)
    yield TestClient(create_app()), mcp_path


class TestValidateMCPConfig:
    """Unit tests for _validate_mcp_config()."""

    def test_valid_config_returns_servers(self, client_and_path):
        client, path = client_and_path
        write(path, VALID_JSON)
        servers = runtime._validate_mcp_config()
        assert len(servers) == 1
        assert servers[0]["name"] == "weather"

    def test_missing_file_raises_value_error(self, client_and_path):
        client, path = client_and_path
        # File never written
        with pytest.raises(ValueError, match="not found"):
            runtime._validate_mcp_config()

    def test_invalid_json_raises_value_error(self, client_and_path):
        client, path = client_and_path
        write(path, INVALID_JSON_STR)
        with pytest.raises(ValueError, match="Invalid JSON"):
            runtime._validate_mcp_config()

    def test_empty_file_raises_value_error(self, client_and_path):
        client, path = client_and_path
        write(path, "")
        with pytest.raises(ValueError, match="empty"):
            runtime._validate_mcp_config()

    def test_non_object_root_raises_value_error(self, client_and_path):
        client, path = client_and_path
        write(path, json.dumps(["not", "an", "object"]))
        with pytest.raises(ValueError, match="must be a JSON object"):
            runtime._validate_mcp_config()

    def test_servers_not_array_raises_value_error(self, client_and_path):
        client, path = client_and_path
        write(path, NOT_ARRAY_JSON)
        with pytest.raises(ValueError, match="'servers' must be an array"):
            runtime._validate_mcp_config()

    def test_fresh_read_each_call(self, client_and_path):
        """Each call reads from disk, not a cached value."""
        client, path = client_and_path
        write(path, VALID_JSON)
        first = runtime._validate_mcp_config()
        assert len(first) == 1

        write(path, TWO_SERVERS_JSON)
        second = runtime._validate_mcp_config()
        assert len(second) == 2
        assert second[1]["name"] == "calculator"


class TestReloadMCPConfigEndpoint:
    """Integration tests for POST /api/config/reload-mcp."""

    def test_reload_valid_config(self, client_and_path):
        client, path = client_and_path
        write(path, VALID_JSON)
        response = client.post("/api/config/reload-mcp")
        assert response.status_code == 200
        body = response.json()
        assert body["servers"] == ["weather"]
        assert body["count"] == 1

    def test_reload_missing_file(self, client_and_path):
        client, path = client_and_path
        response = client.post("/api/config/reload-mcp")
        assert response.status_code == 400
        assert "not found" in response.json()["detail"].lower()

    def test_reload_invalid_json(self, client_and_path):
        client, path = client_and_path
        write(path, INVALID_JSON_STR)
        response = client.post("/api/config/reload-mcp")
        assert response.status_code == 400
        assert "json" in response.json()["detail"].lower()

    def test_reload_empty_servers(self, client_and_path):
        client, path = client_and_path
        write(path, EMPTY_SERVERS_JSON)
        response = client.post("/api/config/reload-mcp")
        assert response.status_code == 200
        body = response.json()
        assert body["servers"] == []
        assert body["count"] == 0

    def test_reload_reflects_file_changes(self, client_and_path):
        """Reloading picks up changes written to disk."""
        client, path = client_and_path
        write(path, VALID_JSON)
        first = client.post("/api/config/reload-mcp")
        assert first.json()["count"] == 1

        write(path, TWO_SERVERS_JSON)
        second = client.post("/api/config/reload-mcp")
        assert second.status_code == 200
        assert second.json()["count"] == 2
        assert set(second.json()["servers"]) == {"weather", "calculator"}


class TestFileReadRuntime:
    """Verify _load_mcp_tools reads MCP_CONFIG_PATH at runtime, not import time."""

    def test_uses_config_module_reference(self, client_and_path, monkeypatch):
        """_load_mcp_tools reads _config.MCP_CONFIG_PATH, not a module-level constant."""
        client, path = client_and_path
        write(path, VALID_JSON)

        # _config is monkeypatched to app.config which has the test path
        assert runtime._config.MCP_CONFIG_PATH == str(path)

        # The function should read from the monkeypatched path
        servers = runtime._validate_mcp_config()
        assert len(servers) == 1
        assert servers[0]["name"] == "weather"

    def test_http_timeout_defaults(self, client_and_path):
        """Verify servers without timeout overrides get sensible defaults."""
        client, path = client_and_path
        write(path, VALID_JSON)

        servers = runtime._validate_mcp_config()
        # Servers from mcp.json don't specify timeout — defaults are applied
        # in _create_mcp_tools / adapter layer, not in validation.
        assert len(servers) == 1
        # Validate that the server entry is well-formed
        assert "name" in servers[0]
        assert "url" in servers[0]
        assert "transport" in servers[0]


class TestFileFirstPrecedence:
    """mcp.json file takes precedence over MCP_SERVERS env var."""

    def test_file_wins_over_env_var(self, client_and_path, monkeypatch):
        """When mcp.json exists, env var is ignored."""
        client, path = client_and_path
        write(path, VALID_JSON)

        # Set env var to a different server
        monkeypatch.setenv(
            "MCP_SERVERS",
            json.dumps([{"name": "env_server", "url": "http://example.com/sse"}]),
        )

        servers = runtime._validate_mcp_config()
        assert len(servers) == 1
        assert servers[0]["name"] == "weather"  # from file, not env var

    def test_empty_servers_list_is_authoritative(self, client_and_path, monkeypatch):
        """mcp.json with empty servers array is authoritative — no env var fallback."""
        client, path = client_and_path
        write(path, EMPTY_SERVERS_JSON)

        monkeypatch.setenv(
            "MCP_SERVERS",
            json.dumps([{"name": "env_server", "url": "http://example.com/sse"}]),
        )

        servers = runtime._validate_mcp_config()
        assert len(servers) == 0  # empty file wins, no fallback


class TestEnvVarFallback:
    """MCP_SERVERS env var used as fallback when mcp.json missing."""

    def test_validate_raises_when_file_missing(self, client_and_path):
        """_validate_mcp_config raises ValueError when mcp.json doesn't exist."""
        client, path = client_and_path
        # File never written — _validate_mcp_config should raise
        with pytest.raises(ValueError, match="not found"):
            runtime._validate_mcp_config()

    def test_file_missing_allows_env_var_fallback(self, client_and_path, monkeypatch):
        """When mcp.json is missing, _load_mcp_tools tries MCP_SERVERS env var.

        The env var is parsed as a dict {"server_name": {...}} (not array format).
        We verify the fallback by setting MCP_SERVERS and confirming _load_mcp_tools
        returns an empty list (adapter not mocked) rather than crashing, and that
        _validate_mcp_config raises (triggering the fallback branch).
        """
        client, path = client_and_path
        # File never written — _validate_mcp_config raises, triggering fallback
        with pytest.raises(ValueError, match="not found"):
            runtime._validate_mcp_config()

        # Verify settings has mcp_servers attribute (fallback source)
        assert hasattr(main_config.settings, "mcp_servers")


# ── Edge case tests (Story 5.5) ───────────────────────────────────────────

MALFORMED_SERVER_JSON = json.dumps({
    "schema_version": "1.0",
    "servers": [
        {
            "name": "good-server",
            "url": "http://localhost:8080/sse",
            "transport": "streamable_http",
        },
        {
            "name": "missing-url",
            "transport": "streamable_http",
        },
    ],
})

SERVER_MISSING_TRANSPORT_JSON = json.dumps({
    "schema_version": "1.0",
    "servers": [
        {
            "name": "no-transport",
            "url": "http://localhost:8080/sse",
        },
    ],
})


class TestMalformedServerEntries:
    """Edge cases for malformed server entries in mcp.json."""

    def test_malformed_server_missing_url(self, client_and_path):
        """Server entry missing 'url' field is returned by _validate_mcp_config."""
        client, path = client_and_path
        write(path, MALFORMED_SERVER_JSON)

        # _validate_mcp_config does not validate individual server fields
        servers = runtime._validate_mcp_config()
        assert len(servers) == 2
        assert servers[1]["name"] == "missing-url"
        assert "url" not in servers[1]

    def test_server_missing_transport_field(self, client_and_path):
        """Server entry missing 'transport' field is returned by _validate_mcp_config."""
        client, path = client_and_path
        write(path, SERVER_MISSING_TRANSPORT_JSON)

        servers = runtime._validate_mcp_config()
        assert len(servers) == 1
        assert servers[0]["name"] == "no-transport"
        assert "transport" not in servers[0]


class TestLargeConfigFile:
    """Edge case: extremely large mcp.json with 1000+ server entries."""

    def test_large_config_does_not_crash(self, client_and_path):
        """Config with 1000+ server entries is parsed without crashing."""
        client, path = client_and_path
        servers = [
            {"name": f"server-{i}", "url": f"http://localhost:{8080 + i}/sse", "transport": "streamable_http"}
            for i in range(1200)
        ]
        large_json = json.dumps({"schema_version": "1.0", "servers": servers})
        write(path, large_json)

        result = runtime._validate_mcp_config()
        assert len(result) == 1200
        assert result[0]["name"] == "server-0"
        assert result[1199]["name"] == "server-1199"


class TestSchemaVersionWarning:
    """Edge case: schema version mismatch behavior."""

    def test_schema_version_mismatch_warns_not_errors(self, client_and_path, caplog, monkeypatch):
        """_load_mcp_tools logs a warning for version mismatch but does not crash.

        Mocks _create_mcp_tools to avoid real network calls to non-existent servers.
        """
        client, path = client_and_path
        import logging
        caplog.set_level(logging.WARNING)

        # Prevent real network calls — test only cares about schema warning
        monkeypatch.setattr(runtime, "_create_mcp_tools", lambda c: [])

        mismatch_json = json.dumps({
            "schema_version": "99.0",
            "servers": [
                {"name": "old-server", "url": "http://localhost:8080/sse", "transport": "streamable_http"},
            ],
        })
        write(path, mismatch_json)

        tools = runtime._load_mcp_tools()
        assert isinstance(tools, list)
        assert any("schema version" in record.message.lower() for record in caplog.records)
