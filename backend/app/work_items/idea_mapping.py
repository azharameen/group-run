"""Filesystem-backed mapping between work items and ideas."""

from __future__ import annotations

import re
import threading
from datetime import UTC, datetime

from ..storage.idea_workspace import create_idea_folder, load_idea_yaml, save_idea_yaml
from ..storage.registry import load_idea_registry, save_idea_registry

_WORK_ITEM_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_mapping_lock = threading.Lock()


def validate_work_item_id(work_item_id: str) -> str:
    """Validate an identifier before it can reach persistence or the filesystem."""
    if (
        not isinstance(work_item_id, str)
        or not _WORK_ITEM_ID_RE.fullmatch(work_item_id)
        or ".." in work_item_id
    ):
        raise ValueError("Invalid work_item_id format")
    return work_item_id


def get_idea_id_for_work_item(work_item_id: str) -> str | None:
    """Find the canonical idea ID recorded for a work item."""
    validate_work_item_id(work_item_id)
    registry = load_idea_registry()
    for entry in registry.get("ideas", []):
        if not isinstance(entry, dict):
            continue
        idea_id = entry.get("idea_id")
        if not isinstance(idea_id, str):
            continue
        try:
            metadata = load_idea_yaml(idea_id, "idea.yaml")
        except ValueError:
            continue
        if isinstance(metadata, dict) and metadata.get("work_item_id") == work_item_id:
            return idea_id
        if entry.get("work_item_id") == work_item_id:
            return idea_id
    return None


def ensure_idea_for_work_item(
    work_item_id: str,
    *,
    title: str,
    description: str = "",
) -> str:
    """Return or create the stable idea record associated with a work item."""
    validate_work_item_id(work_item_id)
    with _mapping_lock:
        existing = get_idea_id_for_work_item(work_item_id)
        if existing:
            return existing

        registry = load_idea_registry()
        next_id = int(registry.get("next_id", 1))
        while True:
            idea_id = f"IDEA-{next_id:04d}"
            try:
                available = load_idea_yaml(idea_id, "idea.yaml") is None
            except ValueError:
                available = False
            if available:
                break
            next_id += 1

        now = datetime.now(UTC).isoformat()
        create_idea_folder(idea_id)
        save_idea_yaml(
            idea_id,
            "idea.yaml",
            {
                "idea_id": idea_id,
                "work_item_id": work_item_id,
                "title": title.strip() or "Untitled",
                "signal_text": description.strip() or title.strip(),
                "created_at": now,
                "updated_at": now,
            },
        )
        registry.setdefault("ideas", []).append(
            {
                "idea_id": idea_id,
                "work_item_id": work_item_id,
                "title": title.strip() or "Untitled",
                "signal_text": description.strip() or title.strip(),
                "created_at": now,
            }
        )
        registry["next_id"] = next_id + 1
        save_idea_registry(registry)
        return idea_id
