import pytest
from fastapi.testclient import TestClient
from app.agent import runtime
from app.api.app import create_app

VALID_YAML = """\
schema_version: "1.0"

teams:
  general:
    name: "General Assistant"
    description: "Default team."
    agents:
      - name: "general-assistant"
        role: "assistant"
        description: "A helpful assistant."
    routing_keys:
      - "general"
      - "default"
"""

def write(path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

@pytest.fixture
def client_and_path(tmp_path, monkeypatch):
    import app.config as config_mod
    config_path = tmp_path / "config" / "teams.yaml"
    # Patch both source and consumer modules
    monkeypatch.setattr("app.config.TEAMS_CONFIG_PATH", str(config_path))
    monkeypatch.setattr("app.agent.runtime.TEAMS_CONFIG_PATH", str(config_path))
    monkeypatch.setattr(runtime, "_config", config_mod)
    # Preserve and restore the module-level config
    original = runtime._teams_config.copy()
    yield TestClient(create_app()), config_path
    runtime._teams_config.clear()
    runtime._teams_config.update(original)

def test_get_config_success(client_and_path):
    """GET /api/config returns the current in-memory team configuration."""
    client, path = client_and_path
    write(path, VALID_YAML)
    # Force reload to ensure test YAML is in memory
    client.post("/api/config/reload")
    
    response = client.get("/api/config")
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "1.0"
    assert "general" in body["teams"]
    general = body["teams"]["general"]
    assert general["name"] == "General Assistant"
    assert len(general["agents"]) == 1
    assert general["agents"][0]["name"] == "general-assistant"
    assert general["agents"][0]["description"] == "A helpful assistant."
    assert "general" in general["routing_keys"]

def test_get_config_updates_after_reload(client_and_path):
    """GET /api/config reflects changes after a successful reload."""
    client, path = client_and_path
    write(path, VALID_YAML)
    client.post("/api/config/reload")
    
    initial = client.get("/api/config").json()
    assert len(initial["teams"]) == 1
    
    # Update with a second team
    TWO_TEAM_YAML = VALID_YAML + """
  patent:
    name: "Patent Team"
    description: "Patent analysis team."
    agents:
      - name: "patent-agent"
        role: "specialist"
    routing_keys:
      - "patent"
"""
    write(path, TWO_TEAM_YAML)
    reload_resp = client.post("/api/config/reload")
    assert reload_resp.status_code == 200
    
    updated = client.get("/api/config").json()
    assert len(updated["teams"]) == 2
    assert "patent" in updated["teams"]
    assert updated["teams"]["patent"]["name"] == "Patent Team"

def test_reload_behavior_integration(client_and_path):
    """The /api/config/reload endpoint surfaces validation errors."""
    client, path = client_and_path
    write(path, VALID_YAML)
    client.post("/api/config/reload")
    
    # Invalid YAML (duplicate routing key)
    INVALID_YAML = VALID_YAML + """
  other:
    name: "Other"
    agents: []
    routing_keys: ["general"]
"""
    write(path, INVALID_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert "duplicate routing_key" in response.json()["detail"].lower()
    
    # Verify GET /api/config still returns the old good config
    current = client.get("/api/config").json()
    assert len(current["teams"]) == 1
    assert "other" not in current["teams"]
