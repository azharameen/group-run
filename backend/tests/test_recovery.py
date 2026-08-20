import os
import shutil
import pytest

from app.storage.recovery import recover_from_filesystem
from app.storage.registry import load_idea_registry, save_idea_registry
from app.storage.base import write_yaml

@pytest.fixture
def recovery_workspace(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    # Mock WORKSPACE_DIR for all relevant modules
    workspace_str = str(workspace)
    monkeypatch.setattr("app.storage.recovery.WORKSPACE_DIR", workspace_str)
    monkeypatch.setattr("app.storage.registry.WORKSPACE_DIR", workspace_str)
    monkeypatch.setattr("app.config.WORKSPACE_DIR", workspace_str)

    # Initialize empty registry
    registry_path = os.path.join(workspace_str, "ideas.yaml")
    write_yaml(registry_path, {"ideas": [], "next_id": 1})

    return workspace_str

def test_recover_from_filesystem_no_ideas_dir(recovery_workspace):
    assert recover_from_filesystem() == 0

def test_recover_from_filesystem_empty_ideas_dir(recovery_workspace):
    os.makedirs(os.path.join(recovery_workspace, "ideas"))
    assert recover_from_filesystem() == 0

def test_recover_from_filesystem_not_directory(recovery_workspace):
    ideas_dir = os.path.join(recovery_workspace, "ideas")
    os.makedirs(ideas_dir)
    file_path = os.path.join(ideas_dir, "not-a-folder.txt")
    with open(file_path, "w") as f:
        f.write("test")

    assert recover_from_filesystem() == 0

def test_recover_from_filesystem_already_registered(recovery_workspace):
    registry = load_idea_registry()
    registry["ideas"].append({"idea_id": "idea-1", "title": "Test Idea"})
    save_idea_registry(registry)

    ideas_dir = os.path.join(recovery_workspace, "ideas")
    idea_folder = os.path.join(ideas_dir, "idea-1")
    os.makedirs(idea_folder)

    assert recover_from_filesystem() == 0

def test_recover_from_filesystem_missing_idea_yaml(recovery_workspace):
    ideas_dir = os.path.join(recovery_workspace, "ideas")
    idea_folder = os.path.join(ideas_dir, "idea-2")
    os.makedirs(idea_folder)

    assert recover_from_filesystem() == 0

def test_recover_from_filesystem_invalid_idea_yaml(recovery_workspace):
    ideas_dir = os.path.join(recovery_workspace, "ideas")
    idea_folder = os.path.join(ideas_dir, "idea-2")
    os.makedirs(idea_folder)

    idea_yaml_path = os.path.join(idea_folder, "idea.yaml")
    with open(idea_yaml_path, "w") as f:
        f.write("not valid yaml dict string")

    assert recover_from_filesystem() == 0

def test_recover_from_filesystem_valid_idea(recovery_workspace):
    ideas_dir = os.path.join(recovery_workspace, "ideas")
    idea_folder = os.path.join(ideas_dir, "idea-5")
    os.makedirs(idea_folder)

    write_yaml(os.path.join(idea_folder, "idea.yaml"), {
        "title": "Recovered Idea",
        "current_state": "researching",
        "phase": "design",
        "created_at": "2023-01-01"
    })

    recovered = recover_from_filesystem()
    assert recovered == 1

    registry = load_idea_registry()
    assert len(registry["ideas"]) == 1
    assert registry["ideas"][0]["idea_id"] == "idea-5"
    assert registry["ideas"][0]["title"] == "Recovered Idea"
    assert registry["ideas"][0]["state"] == "researching"
    assert registry["ideas"][0]["phase"] == "design"
    assert registry["ideas"][0]["created_at"] == "2023-01-01"

    assert registry["next_id"] == 6

def test_recover_from_filesystem_multiple_ideas(recovery_workspace):
    ideas_dir = os.path.join(recovery_workspace, "ideas")
    os.makedirs(ideas_dir)

    idea_folder_1 = os.path.join(ideas_dir, "idea-2")
    os.makedirs(idea_folder_1)
    write_yaml(os.path.join(idea_folder_1, "idea.yaml"), {
        "title": "Idea 2"
    })

    idea_folder_2 = os.path.join(ideas_dir, "idea-3")
    os.makedirs(idea_folder_2)
    write_yaml(os.path.join(idea_folder_2, "idea.yaml"), {
        "title": "Idea 3"
    })

    registry = load_idea_registry()
    registry["ideas"].append({"idea_id": "idea-10", "title": "Registered Idea"})
    save_idea_registry(registry)

    idea_folder_3 = os.path.join(ideas_dir, "idea-10")
    os.makedirs(idea_folder_3)
    write_yaml(os.path.join(idea_folder_3, "idea.yaml"), {
        "title": "Idea 10"
    })

    recovered = recover_from_filesystem()
    assert recovered == 2

    registry = load_idea_registry()
    assert len(registry["ideas"]) == 3
    assert registry["next_id"] == 11
