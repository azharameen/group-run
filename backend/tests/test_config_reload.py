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

TWO_TEAM_YAML = """\
schema_version: "1.0"

teams:
  general:
    name: "General Assistant"
    description: "Default team."
    agents:
      - name: "general-assistant"
        role: "assistant"
        model: "auto"
    subgraph:
      type: "sequential"
      nodes:
        - "general-assistant"
    routing_keys:
      - "general"
  patent:
    name: "Patent Team"
    description: "Patent team."
    agents:
      - name: "patent-agent"
        role: "assistant"
        model: "auto"
    subgraph:
      type: "sequential"
      nodes:
        - "patent-agent"
    routing_keys:
      - "patent"
"""

VERSION_MISMATCH_YAML = VALID_YAML.replace('schema_version: "1.0"', 'schema_version: "2.0"')

INVALID_YAML = "schema_version: \"1.0\"\nteams: {[invalid"

DUPLICATE_KEYS_YAML = """\
schema_version: "1.0"

teams:
  general:
    name: "General"
    agents:
      - name: "a"
    subgraph:
      nodes:
        - "a"
    routing_keys:
      - "shared"
  other:
    name: "Other"
    agents:
      - name: "b"
    subgraph:
      nodes:
        - "b"
    routing_keys:
      - "shared"
"""


def write(path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.fixture
def client_and_path(tmp_path, monkeypatch):
    import app.config as config_mod
    config_path = tmp_path / "config" / "teams.yaml"
    # Patch both source and consumer modules — test_chat_endpoint.py clears
    # app.config from sys.modules, causing a reimport that overwrites the
    # runtime module attribute. Patching all three keeps them in sync.
    monkeypatch.setattr("app.config.TEAMS_CONFIG_PATH", str(config_path))
    monkeypatch.setattr("app.agent.runtime.TEAMS_CONFIG_PATH", str(config_path))
    # runtime.py imports `from .. import config as _config` and reads
    # _config.TEAMS_CONFIG_PATH at runtime. Patch _config so it points to
    # the current app.config module (which has our monkeypatched value).
    monkeypatch.setattr(runtime, "_config", config_mod)
    # Preserve and restore the module-level config so tests don't leak state.
    original = runtime._teams_config.copy()
    yield TestClient(create_app()), config_path
    runtime._teams_config.clear()
    runtime._teams_config.update(original)


def test_reload_valid_config(client_and_path):
    client, path = client_and_path
    write(path, VALID_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 200
    body = response.json()
    assert body["teams"] == ["general"]
    assert body["count"] == 1
    assert runtime._teams_config["teams"]["general"]["name"] == "General Assistant"


def test_reload_missing_file(client_and_path):
    client, path = client_and_path
    # File never written.
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_reload_invalid_yaml(client_and_path):
    client, path = client_and_path
    write(path, INVALID_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert "parse" in response.json()["detail"].lower()


def test_reload_version_mismatch(client_and_path):
    client, path = client_and_path
    write(path, VERSION_MISMATCH_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert "version" in response.json()["detail"].lower()


def test_reload_duplicate_routing_keys(client_and_path):
    client, path = client_and_path
    write(path, DUPLICATE_KEYS_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert "routing_key" in response.json()["detail"].lower()


def test_reload_preserves_config_on_failure(client_and_path):
    client, path = client_and_path
    # First a successful reload to establish a known good state.
    write(path, VALID_YAML)
    assert client.post("/api/config/reload").status_code == 200
    good_config = runtime._teams_config

    # Now corrupt the file and reload — must fail and preserve prior config.
    write(path, VERSION_MISMATCH_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert runtime._teams_config is good_config
    assert runtime._teams_config["teams"]["general"]["name"] == "General Assistant"


def test_reload_returns_updated_teams_after_change(client_and_path):
    client, path = client_and_path
    write(path, VALID_YAML)
    first = client.post("/api/config/reload")
    assert first.json()["teams"] == ["general"]

    write(path, TWO_TEAM_YAML)
    second = client.post("/api/config/reload")
    assert second.status_code == 200
    assert second.json()["count"] == 2
    assert set(second.json()["teams"]) == {"general", "patent"}


def test_reload_idempotency(client_and_path):
    client, path = client_and_path
    write(path, VALID_YAML)
    first = client.post("/api/config/reload")
    second = client.post("/api/config/reload")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


# ── Edge case tests (Story 5.5) ───────────────────────────────────────────

EMPTY_TEAMS_YAML = """\
schema_version: "1.0"

teams: {}
"""

NONEXISTENT_NODE_YAML = """\
schema_version: "1.0"

teams:
  mismatch:
    name: "Node Mismatch Team"
    description: "Team with invalid node reference."
    agents:
      - name: "real-agent"
        role: "assistant"
        model: "auto"
    subgraph:
      type: "sequential"
      nodes:
        - "imaginary-agent"
    routing_keys:
      - "mismatch"
"""


def test_reload_empty_teams_dict(client_and_path):
    """A teams.yaml with an empty teams dict is rejected with a 400 error."""
    client, path = client_and_path
    write(path, EMPTY_TEAMS_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    assert "at least one team" in response.json()["detail"].lower()


def test_reload_nonexistent_node_reference(client_and_path):
    """subgraph.nodes referencing a non-existent agent is rejected with a 400 error."""
    client, path = client_and_path
    write(path, NONEXISTENT_NODE_YAML)
    response = client.post("/api/config/reload")
    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "imaginary-agent" in detail
    assert "real-agent" in detail
