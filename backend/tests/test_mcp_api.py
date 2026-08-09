import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app


def write_config(path: Path, servers: list[dict] | None = None, schema_version: str = "1.0") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema_version": schema_version, "servers": servers or []}), encoding="utf-8")


@pytest.fixture
def client_and_path(tmp_path, monkeypatch):
    config_path = tmp_path / "config" / "mcp.json"
    monkeypatch.setattr("app.api.routes.mcp.MCP_CONFIG_PATH", str(config_path))
    monkeypatch.setattr("app.config.MCP_CONFIG_PATH", str(config_path))
    return TestClient(create_app()), config_path


def test_list_empty_servers(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.get("/api/mcp/servers/")
    assert response.status_code == 200
    assert response.json() == {"servers": [], "count": 0}


def test_list_servers_with_data(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [
        {"name": "one", "transport": "http", "url": "http://localhost:1/mcp", "timeout": 10, "options": {}},
        {"name": "two", "transport": "http", "url": "http://localhost:2/mcp", "timeout": 20, "options": {"headers": {}}},
    ])
    response = client.get("/api/mcp/servers/")
    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert [s["name"] for s in response.json()["servers"]] == ["one", "two"]


def test_add_server_success(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.post("/api/mcp/servers/", json={"name": "demo", "url": "http://localhost:3001/mcp", "timeout": 15})
    assert response.status_code == 201
    assert response.json()["name"] == "demo"


def test_add_duplicate_server(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [{"name": "demo", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 10, "options": {}}])
    response = client.post("/api/mcp/servers/", json={"name": "demo", "url": "http://localhost:3002/mcp"})
    assert response.status_code == 409


def test_add_server_invalid_url(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.post("/api/mcp/servers/", json={"name": "demo", "url": "not-a-url"})
    assert response.status_code == 422


def test_add_server_persists_to_file(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [])
    client.post("/api/mcp/servers/", json={"name": "demo", "url": "http://localhost:3001/mcp", "timeout": 15})
    data = json.loads(config_path.read_text(encoding="utf-8"))
    assert data["schema_version"] == "1.0"
    assert data["servers"][0]["name"] == "demo"
    assert data["servers"][0]["url"] == "http://localhost:3001/mcp"


def test_remove_server_success(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [{"name": "demo", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 10, "options": {}}])
    response = client.delete("/api/mcp/servers/demo")
    assert response.status_code == 200
    assert response.json()["name"] == "demo"
    assert json.loads(config_path.read_text(encoding="utf-8"))["servers"] == []


def test_remove_nonexistent_server(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.delete("/api/mcp/servers/missing")
    assert response.status_code == 404


def test_get_server_success(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [{"name": "demo", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 10, "options": {}}])
    response = client.get("/api/mcp/servers/demo")
    assert response.status_code == 200
    assert response.json()["name"] == "demo"


def test_get_nonexistent_server(client_and_path):
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.get("/api/mcp/servers/missing")
    assert response.status_code == 404


def test_list_filters_stdio_servers(client_and_path):
    """stdio servers are excluded from list response (only HTTP servers managed)."""
    client, config_path = client_and_path
    write_config(config_path, [
        {"name": "stdio-srv", "transport": "stdio", "command": "npx", "args": ["-y", "test"], "options": {}},
        {"name": "http-srv", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 10, "options": {}},
    ])
    response = client.get("/api/mcp/servers/")
    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["servers"][0]["name"] == "http-srv"


# ── Edge case tests (Story 5.5) ───────────────────────────────────────────


def test_add_server_zero_timeout(client_and_path):
    """Server with timeout=0 is rejected by Pydantic validation (ge=1)."""
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.post("/api/mcp/servers/", json={"name": "zero", "url": "http://localhost:9999/mcp", "timeout": 0})
    assert response.status_code == 422


def test_add_server_negative_timeout(client_and_path):
    """Server with negative timeout is rejected by Pydantic validation (ge=1)."""
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.post("/api/mcp/servers/", json={"name": "neg", "url": "http://localhost:9999/mcp", "timeout": -1})
    assert response.status_code == 422


def test_add_server_empty_name_rejected(client_and_path):
    """Server with empty name is rejected by Pydantic validation (min_length=1)."""
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.post("/api/mcp/servers/", json={"name": "", "url": "http://localhost:9999/mcp"})
    assert response.status_code == 422


def test_add_server_empty_url_rejected(client_and_path):
    """Server with empty URL is rejected by HttpUrl validation."""
    client, config_path = client_and_path
    write_config(config_path, [])
    response = client.post("/api/mcp/servers/", json={"name": "empty-url", "url": ""})
    assert response.status_code == 422


def test_add_server_duplicate_case_insensitive(client_and_path):
    """Duplicate detection is case-sensitive: 'Demo' does not match 'demo'.

    Verifying the existing behavior is consistent — names that differ only by
    case are treated as distinct servers.
    """
    client, config_path = client_and_path
    write_config(config_path, [
        {"name": "demo", "transport": "http", "url": "http://localhost:3001/mcp", "timeout": 10, "options": {}},
    ])
    # "Demo" is NOT a duplicate of "demo" (case-sensitive comparison)
    response = client.post("/api/mcp/servers/", json={"name": "Demo", "url": "http://localhost:3002/mcp"})
    assert response.status_code == 201
    assert response.json()["name"] == "Demo"
    # Verify both servers now exist
    list_response = client.get("/api/mcp/servers/")
    assert list_response.status_code == 200
    names = [s["name"] for s in list_response.json()["servers"]]
    assert "demo" in names
    assert "Demo" in names

