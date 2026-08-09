import os
import shutil
from pathlib import Path

import pytest
from app.agent.backends import build_agent_backend
from app import config

@pytest.fixture
def temp_workspace(tmp_path, monkeypatch):
    """Setup a temporary workspace with all backend directories."""
    root_dir = tmp_path / "project"
    root_dir.mkdir()
    
    workspace_dir = root_dir / "workspace"
    kb_dir = root_dir / "knowledge-base"
    inst_dir = root_dir / "instructions"
    memories_dir = root_dir / "memories"
    skills_dir = root_dir / "skills"
    
    for d in [workspace_dir, kb_dir, inst_dir, memories_dir, skills_dir]:
        d.mkdir(parents=True)
        
    # Mock config paths in all relevant modules
    root_dir_str = str(root_dir)
    monkeypatch.setattr("app.config.ROOT_DIR", root_dir_str)
    monkeypatch.setattr("app.config.WORKSPACE_DIR", str(workspace_dir))
    monkeypatch.setattr("app.config.KNOWLEDGE_BASE_DIR", str(kb_dir))
    monkeypatch.setattr("app.config.INSTRUCTIONS_DIR", str(inst_dir))
    
    # CRITICAL: Also mock them in the backends module since they were imported top-level
    monkeypatch.setattr("app.agent.backends.ROOT_DIR", root_dir_str)
    monkeypatch.setattr("app.agent.backends.WORKSPACE_DIR", str(workspace_dir))
    monkeypatch.setattr("app.agent.backends.KNOWLEDGE_BASE_DIR", str(kb_dir))
    monkeypatch.setattr("app.agent.backends.INSTRUCTIONS_DIR", str(inst_dir))
    
    return {
        "root": root_dir,
        "workspace": workspace_dir,
        "kb": kb_dir,
        "instructions": inst_dir,
        "memories": memories_dir,
        "skills": skills_dir
    }

def test_memory_routing_and_persistence(temp_workspace):
    """Verify that writing to /memories/ persists to the correct physical directory."""
    backend = build_agent_backend()
    
    test_content = "Hello, persistent memory!"
    test_path = "/memories/note.txt"
    
    # Write via backend
    result = backend.write(test_path, test_content)
    assert not result.error, f"Write failed: {result.error}"
    
    # Verify physical existence
    physical_path = temp_workspace["memories"] / "note.txt"
    assert physical_path.exists(), f"Physical file not found at {physical_path}"
    assert physical_path.read_text(encoding="utf-8") == test_content
    
    # Verify read via backend
    read_result = backend.read(test_path)
    assert not read_result.error
    
    # Handle both object and dict return types (DeepAgents version variance)
    file_data = read_result.file_data
    if hasattr(file_data, "content"):
        assert file_data.content == test_content
    else:
        assert file_data["content"] == test_content

def test_memory_persistence_across_instances(temp_workspace):
    """Verify that data survives across different backend instances."""
    # Instance 1: Write
    backend1 = build_agent_backend()
    backend1.write("/memories/persist.txt", "Surviving restart")
    
    # Instance 2: Read
    backend2 = build_agent_backend()
    read_result = backend2.read("/memories/persist.txt")
    assert not read_result.error
    
    file_data = read_result.file_data
    if hasattr(file_data, "content"):
        assert file_data.content == "Surviving restart"
    else:
        assert file_data["content"] == "Surviving restart"

def test_backend_isolation(temp_workspace):
    """Verify that backend routes are isolated and path traversal is blocked."""
    backend = build_agent_backend()
    
    # Attempt to escape via /memories/
    # FilesystemBackend should raise ValueError or return result with error
    try:
        result = backend.read("/memories/../../.env")
        assert result.error is not None or "error" in str(result).lower()
    except ValueError as e:
        assert "traversal" in str(e).lower()
    
    # Attempt to write outside allowed routes
    # This will be routed to StateBackend, which requires LangGraph context
    try:
        result = backend.write("/tmp/hack.txt", "evil")
        assert result.error is not None
    except (ValueError, RuntimeError) as e:
        # Both traversal (ValueError) and missing context (RuntimeError) are acceptable blocks
        assert any(word in str(e).lower() for word in ["context", "traversal", "not allowed"])

def test_kb_routing(temp_workspace):
    """Verify that /kb/ route also works and persists."""
    backend = build_agent_backend()
    
    backend.write("/kb/shared.md", "# Shared Knowledge")
    
    physical_path = temp_workspace["kb"] / "shared.md"
    assert physical_path.exists()
    assert physical_path.read_text(encoding="utf-8") == "# Shared Knowledge"
