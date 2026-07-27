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


@pytest.fixture
def patch_config(temp_workspace: str, monkeypatch: pytest.MonkeyPatch):
    """Point WORKSPACE_DIR at the temp workspace so tests don't touch real data."""
    monkeypatch.setattr("app.config.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.yaml_io.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.orchestrator.tools.WORKSPACE_DIR", temp_workspace)
    return temp_workspace
