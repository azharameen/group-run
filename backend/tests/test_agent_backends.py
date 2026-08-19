from pathlib import Path
from unittest.mock import patch

from app.agent.backends import build_agent_backend


def test_build_agent_backend_success(patch_config, monkeypatch):
    """Test build_agent_backend returns CompositeBackend when deepagents is installed."""
    from deepagents.backends import CompositeBackend

    # We patch ROOT_DIR so we don't create real directories in the source tree
    monkeypatch.setattr("app.agent.backends.ROOT_DIR", patch_config)

    backend = build_agent_backend()

    assert isinstance(backend, CompositeBackend)
    # Check if directories were created
    memories_dir = Path(patch_config) / "memories"
    skills_dir = Path(patch_config) / "skills"
    assert memories_dir.exists()
    assert skills_dir.exists()

    # Check routes
    assert "/workspace/" in backend.routes
    assert "/kb/" in backend.routes
    assert "/instructions/" in backend.routes
    assert "/memories/" in backend.routes
    assert "/skills/" in backend.routes

    # Verify the fallback behaviour wasn't hit
    assert getattr(backend, "__name__", "") != "MockBackend"


def test_build_agent_backend_fallback(monkeypatch, caplog):
    """Test build_agent_backend returns MockBackend when deepagents is not installed."""

    # Mocking sys.modules to simulate deepagents being uninstalled
    with patch.dict("sys.modules", {"deepagents.backends": None}):
        backend = build_agent_backend()

    # Check that fallback happened
    assert type(backend).__name__ == "MockBackend"

    # Check warning was logged
    assert "DeepAgents not found" in caplog.text

    # Verify MockBackend methods can be called safely
    mock_inst = backend()
    assert mock_inst is backend

    ls_result = backend.ls()
    assert getattr(ls_result, "error") == "Mock"
    assert getattr(ls_result, "entries") == []

    read_result = backend.read()
    assert getattr(read_result, "error") == "Mock"
    assert getattr(read_result, "file_data") is None

    write_result = backend.write()
    assert getattr(write_result, "error") == "Mock"
