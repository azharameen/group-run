"""Shared fixtures for backend tests."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def temp_workspace(tmp_path: Path) -> str:
    """Create a temporary workspace directory with ideas.yaml."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    ideas_yaml = ws / "ideas.yaml"
    ideas_yaml.write_text("ideas: []\nnext_id: 1\n", encoding="utf-8")
    ideas_dir = ws / "ideas"
    ideas_dir.mkdir()
    return str(ws)


@pytest.fixture(autouse=True)
def isolate_test_env(monkeypatch: pytest.MonkeyPatch):
    """Prevent real LLM calls in tests by clearing credentials."""
    monkeypatch.setattr("app.config.settings.openai_api_key", "")
    monkeypatch.setattr("app.config.settings.openai_api_base", "")
    monkeypatch.setattr("app.config.settings.openai_model_name", "")


@pytest.fixture
def patch_config(temp_workspace: str, monkeypatch: pytest.MonkeyPatch):
    """Point all WORKSPACE_DIR imports at the temp workspace."""
    monkeypatch.setattr("app.config.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.yaml_io.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.registry.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.ideas.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.recovery.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.orchestrator.tools.WORKSPACE_DIR", temp_workspace)
    return temp_workspace
