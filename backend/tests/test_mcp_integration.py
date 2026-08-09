"""Integration tests for MCP config reload pipeline & teams config resilience (Story 5.5).

Spans the full flow: MCP server API → config file → runtime validation.
All tests use mocked boundaries — no live HTTP, model, or database calls.
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import config as main_config
from app.agent import runtime
from app.api.app import create_app
from app.api.routes.mcp import _service

# ── Helpers ───────────────────────────────────────────────────────────────

VALID_TEAMS_YAML = """\
schema_version: "1.0"

teams:
  general:
    name: "General Assistant"
    description: "Default team."
    agents:
      - name: "general-assistant"
        role: "assistant"
        model: "auto"
    tools:
      - "search"
    subgraph:
      type: "sequential"
      nodes:
        - "general-assistant"
    routing_keys:
      - "general"
      - "default"
"""

INVALID_TEAMS_YAML = "schema_version: \"1.0\"\nteams: {[invalid"


def _write_mcp_config(path: Path, servers: list[dict] | None = None) -> None:
    """Write MCP config to the specified path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"schema_version": "1.0", "servers": servers or []}), encoding="utf-8"
    )


def _write_teams_config(path: Path, content: str) -> None:
    """Write teams config to the specified path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")



@pytest.fixture
def integration_client(tmp_path, monkeypatch):
    """Full integration fixture with both MCP and teams config patched.

    Patches MCP_CONFIG_PATH and TEAMS_CONFIG_PATH at all three locations:
    - app.config module attributes
    - app.agent.runtime module attributes
    - runtime._config module reference

    Also clears relevant modules from sys.modules so the patched values
    are picked up on reimport.
    """
    mcp_path = tmp_path / "config" / "mcp.json"
    teams_path = tmp_path / "config" / "teams.yaml"

    # Write initial configs
    _write_mcp_config(mcp_path, [])
    _write_teams_config(teams_path, VALID_TEAMS_YAML)

    import app.config as config_mod

    # Three-location monkeypatch for MCP
    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(mcp_path))
    monkeypatch.setattr("app.agent.runtime.MCP_CONFIG_PATH", str(mcp_path))
    monkeypatch.setattr("app.api.routes.mcp.MCP_CONFIG_PATH", str(mcp_path))
    monkeypatch.setattr(runtime, "_config", config_mod)

    # Three-location monkeypatch for teams
    monkeypatch.setattr("app.config.TEAMS_CONFIG_PATH", str(teams_path))
    monkeypatch.setattr("app.agent.runtime.TEAMS_CONFIG_PATH", str(teams_path))

    # Unset env var that might linger
    monkeypatch.delenv("MCP_SERVERS", raising=False)

    # Save and restore _teams_config to prevent test leakage
    original_teams = runtime._teams_config.copy()

    # Force reload teams config with the new path
    runtime._teams_config.clear()
    runtime._teams_config.update({"schema_version": "1.0", "teams": {}})

    yield TestClient(create_app()), mcp_path, teams_path

    runtime._teams_config.clear()
    runtime._teams_config.update(original_teams)


# ── Integration tests ────────────────────────────────────────────────────


class TestMCPServerFullPipeline:
    """POST add server → GET list → reload-mcp → verify runtime count."""

    def test_add_server_reflected_in_reload(self, integration_client):
        """Adding an MCP server via API is visible to runtime validation."""
        client, mcp_path, _ = integration_client

        # Ensure clean state
        _write_mcp_config(mcp_path, [])

        # Step 1: Add server via API
        add_response = client.post("/api/mcp/servers/", json={
            "name": "pipeline-server",
            "url": "http://localhost:8080/sse",
            "timeout": 15,
        })
        assert add_response.status_code == 201
        assert add_response.json()["name"] == "pipeline-server"

        # Step 2: Verify via GET list
        list_response = client.get("/api/mcp/servers/")
        assert list_response.status_code == 200
        assert list_response.json()["count"] == 1
        assert list_response.json()["servers"][0]["name"] == "pipeline-server"

        # Step 3: Reload MCP config and verify
        reload_response = client.post("/api/config/reload-mcp")
        assert reload_response.status_code == 200
        reload_body = reload_response.json()
        assert reload_body["count"] == 1
        assert "pipeline-server" in reload_body["servers"]

        # Step 4: Verify runtime._validate_mcp_config sees the server
        servers = runtime._validate_mcp_config()
        assert len(servers) == 1
        assert servers[0]["name"] == "pipeline-server"


class TestMCPServerAddRemoveReload:
    """Add server → remove server → reload-mcp → verify removal."""

    def test_add_then_remove_server(self, integration_client):
        """Removing a server via API is reflected in the config reload."""
        client, mcp_path, _ = integration_client

        # Ensure clean state
        _write_mcp_config(mcp_path, [])

        # Add server
        client.post("/api/mcp/servers/", json={
            "name": "temp-server",
            "url": "http://localhost:8080/sse",
        })
        assert client.get("/api/mcp/servers/").json()["count"] == 1

        # Remove server
        remove_response = client.delete("/api/mcp/servers/temp-server")
        assert remove_response.status_code == 200
        assert remove_response.json()["name"] == "temp-server"

        # Reload and verify removal
        reload_response = client.post("/api/config/reload-mcp")
        assert reload_response.status_code == 200
        assert reload_response.json()["count"] == 0
        assert reload_response.json()["servers"] == []


class TestInvalidServerAdditionRejected:
    """Invalid server addition rejected → list unchanged."""

    def test_invalid_addition_does_not_modify_list(self, integration_client):
        """Attempting to add a server with an invalid URL does not modify the server list."""
        client, mcp_path, _ = integration_client

        # Start with a clean config containing one valid server
        _write_mcp_config(mcp_path, [
            {"name": "original-server", "transport": "http",
             "url": "http://localhost:8080/sse", "timeout": 10, "options": {}},
        ])

        # Verify starting state
        list_before = client.get("/api/mcp/servers/")
        assert list_before.json()["count"] == 1

        # Try to add invalid server (bad URL)
        bad_response = client.post("/api/mcp/servers/", json={
            "name": "bad-server",
            "url": "not-a-url",
        })
        assert bad_response.status_code == 422

        # Verify list is unchanged
        list_response = client.get("/api/mcp/servers/")
        assert list_response.status_code == 200
        assert list_response.json()["count"] == 1
        assert list_response.json()["servers"][0]["name"] == "original-server"


class TestTeamsConfigReloadPreservation:
    """Config reload with invalid teams.yaml preserves existing config."""

    def test_invalid_teams_yaml_preserves_existing_config(self, integration_client):
        """Reloading with an invalid teams.yaml fails gracefully; existing config is preserved."""
        client, _, teams_path = integration_client

        # Step 1: Load valid config to establish known state
        reload1 = client.post("/api/config/reload")
        assert reload1.status_code == 200
        assert reload1.json()["teams"] == ["general"]
        original_name = runtime._teams_config["teams"]["general"]["name"]

        # Step 2: Corrupt the teams.yaml file
        _write_teams_config(teams_path, INVALID_TEAMS_YAML)

        # Step 3: Reload — should fail
        reload2 = client.post("/api/config/reload")
        assert reload2.status_code == 400
        assert "parse" in reload2.json()["detail"].lower()

        # Step 4: Verify existing config is preserved
        assert "general" in runtime._teams_config.get("teams", {})
        assert runtime._teams_config["teams"]["general"]["name"] == original_name
