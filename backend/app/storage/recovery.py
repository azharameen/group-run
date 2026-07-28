"""Recovery helpers for filesystem-backed ideas."""

import os

from ..config import WORKSPACE_DIR
from .base import read_yaml
from .registry import load_idea_registry, save_idea_registry


def recover_from_filesystem() -> int:
    """Scan workspace/ideas for idea folders not yet registered."""
    registry = load_idea_registry()
    registered_ids = {entry["idea_id"] for entry in registry.get("ideas", [])}
    ideas_dir = os.path.join(WORKSPACE_DIR, "ideas")

    if not os.path.exists(ideas_dir):
        return 0

    recovered = 0
    max_id = registry.get("next_id", 1)

    for folder_name in sorted(os.listdir(ideas_dir)):
        folder_path = os.path.join(ideas_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        idea_id = folder_name
        if idea_id in registered_ids:
            parts = idea_id.split("-")
            if len(parts) == 2 and parts[1].isdigit():
                number = int(parts[1])
                if number >= max_id:
                    max_id = number + 1
            continue

        idea_yaml_path = os.path.join(folder_path, "idea.yaml")
        if not os.path.exists(idea_yaml_path):
            continue

        idea_data = read_yaml(idea_yaml_path)
        if not idea_data or not isinstance(idea_data, dict):
            continue

        registry["ideas"].append(
            {
                "idea_id": idea_id,
                "title": idea_data.get("title", idea_id),
                "state": idea_data.get("current_state", "raw_signal_collected"),
                "phase": idea_data.get("phase", "discovery"),
                "created_at": idea_data.get("created_at", ""),
            }
        )

        parts = idea_id.split("-")
        if len(parts) == 2 and parts[1].isdigit():
            number = int(parts[1])
            if number >= max_id:
                max_id = number + 1

        recovered += 1

    if recovered > 0:
        registry["next_id"] = max_id
        save_idea_registry(registry)

    return recovered
