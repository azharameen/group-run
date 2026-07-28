"""Registry persistence helpers."""

import os

from ..config import WORKSPACE_DIR
from .base import read_yaml, write_yaml


def load_idea_registry() -> dict:
    """Load the idea registry from workspace/ideas.yaml."""
    path = os.path.join(WORKSPACE_DIR, "ideas.yaml")
    if not os.path.exists(path):
        return {"ideas": [], "next_id": 1}
    return read_yaml(path)


def save_idea_registry(registry: dict):
    """Save the idea registry to workspace/ideas.yaml."""
    write_yaml(os.path.join(WORKSPACE_DIR, "ideas.yaml"), registry)


def remove_from_registry(idea_id: str) -> bool:
    """Remove an idea from the registry."""
    registry = load_idea_registry()
    before = len(registry.get("ideas", []))
    registry["ideas"] = [entry for entry in registry.get("ideas", []) if entry.get("idea_id") != idea_id]
    if len(registry["ideas"]) < before:
        save_idea_registry(registry)
        return True
    return False
