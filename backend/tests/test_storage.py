"""Tests for filesystem persistence layer."""

import os

import pytest

from app.storage.yaml_io import (
    load_idea_registry,
    save_idea_registry,
    create_idea_folder,
    load_idea_yaml,
    save_idea_yaml,
    recover_from_filesystem,
    idea_folder_path,
)


class TestIdeaRegistry:
    def test_load_empty_registry(self, patch_config):
        """A fresh workspace should return an empty registry."""
        registry = load_idea_registry()
        assert registry == {"ideas": [], "next_id": 1}

    def test_save_and_load_registry(self, patch_config):
        """Round-trip save/load preserves registry data."""
        registry = {"ideas": [{"idea_id": "IDEA-0001", "title": "Test"}], "next_id": 2}
        save_idea_registry(registry)
        loaded = load_idea_registry()
        assert loaded == registry

    def test_recover_from_filesystem(self, patch_config):
        """recover_from_filesystem should register unregistered idea folders."""
        ws = patch_config
        ideas_dir = os.path.join(ws, "ideas")
        folder = os.path.join(ideas_dir, "IDEA-0001")
        os.makedirs(folder, exist_ok=True)

        # Write a minimal idea.yaml
        import yaml
        with open(os.path.join(folder, "idea.yaml"), "w") as f:
            yaml.dump({"title": "Recovered Idea", "current_state": "idea_discovery"}, f)

        count = recover_from_filesystem()
        assert count == 1

        registry = load_idea_registry()
        assert len(registry["ideas"]) == 1
        assert registry["ideas"][0]["idea_id"] == "IDEA-0001"
        assert registry["ideas"][0]["title"] == "Recovered Idea"

    def test_recover_skips_registered(self, patch_config):
        """Already-registered ideas should not be recovered again."""
        ws = patch_config
        registry = {"ideas": [{"idea_id": "IDEA-0001", "title": "Existing"}], "next_id": 2}
        save_idea_registry(registry)

        count = recover_from_filesystem()
        assert count == 0


class TestIdeaFolder:
    def test_create_and_load_idea_yaml(self, patch_config):
        """Creating an idea folder and writing YAML should persist correctly."""
        ws = patch_config
        idea_id = "IDEA-0001"
        create_idea_folder(idea_id)

        data = {"title": "My Idea", "current_state": "raw_signal_collected"}
        save_idea_yaml(idea_id, "idea.yaml", data)

        loaded = load_idea_yaml(idea_id, "idea.yaml")
        assert loaded == data

    def test_load_nonexistent_returns_none(self, patch_config):
        """Loading a YAML from a non-existent idea folder returns None."""
        result = load_idea_yaml("IDEA-9999", "idea.yaml")
        assert result is None

    def test_idea_folder_path(self, patch_config):
        """idea_folder_path should return the correct absolute path."""
        path = idea_folder_path("IDEA-0001")
        assert path.endswith("IDEA-0001")
        assert os.path.isabs(path)
