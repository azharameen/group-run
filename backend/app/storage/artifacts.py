"""Artifact revision and diff persistence helpers."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from difflib import unified_diff
from pathlib import Path
from typing import Any

from ..work_items.models import TrustLevel
from .base import read_yaml, write_markdown, write_yaml
from .idea_workspace import idea_folder_path, load_idea_yaml, save_idea_yaml


def _artifact_dir(idea_id: str) -> Path:
    path = Path(idea_folder_path(idea_id)) / "revisions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _artifact_index_path(idea_id: str) -> Path:
    return _artifact_dir(idea_id) / "artifact-revisions.yaml"


def load_artifact_revisions(idea_id: str) -> list[dict[str, Any]]:
    path = _artifact_index_path(idea_id)
    if not path.exists():
        return []
    data = read_yaml(str(path))
    return data if isinstance(data, list) else []


def save_artifact_revision(
    idea_id: str,
    artifact_name: str,
    content: str,
    *,
    provenance: str,
    trust: TrustLevel = "generated",
    evidence_refs: list[str] | None = None,
    agent_id: str = "unknown",
) -> dict[str, Any]:
    revisions = load_artifact_revisions(idea_id)
    version = len([r for r in revisions if r.get("artifact_name") == artifact_name]) + 1
    timestamp = datetime.now(UTC).isoformat()
    file_name = f"{artifact_name}-v{version:02d}.md"
    artifact_path = _artifact_dir(idea_id) / file_name

    previous = next(
        (r for r in reversed(revisions) if r.get("artifact_name") == artifact_name),
        None,
    )
    previous_content = ""
    if previous and previous.get("path") and os.path.exists(previous["path"]):
        previous_content = Path(previous["path"]).read_text(encoding="utf-8")

    write_markdown(str(artifact_path), content)
    diff_text = "\n".join(
        unified_diff(
            previous_content.splitlines(),
            content.splitlines(),
            fromfile=previous.get("file_name", "previous") if previous else "previous",
            tofile=file_name,
            lineterm="",
        )
    )

    record = {
        "artifact_name": artifact_name,
        "version": version,
        "timestamp": timestamp,
        "path": str(artifact_path),
        "file_name": file_name,
        "content": content,
        "diff": diff_text,
        "provenance": provenance,
        "agent_id": agent_id,
        "trust": trust,
        "evidence_refs": evidence_refs or [],
    }
    revisions.append(record)
    write_yaml(str(_artifact_index_path(idea_id)), revisions)

    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
    artifact_meta = idea_data.get("artifact_revisions", {})
    artifact_meta[artifact_name] = {
        "version": version,
        "path": str(artifact_path),
        "provenance": provenance,
        "agent_id": agent_id,
        "trust": trust,
        "updated_at": timestamp,
    }
    idea_data["artifact_revisions"] = artifact_meta
    save_idea_yaml(idea_id, "idea.yaml", idea_data)

    return record


def build_artifact_comparison(idea_id: str, artifact_name: str) -> dict[str, Any]:
    revisions = [r for r in load_artifact_revisions(idea_id) if r.get("artifact_name") == artifact_name]
    if len(revisions) < 2:
        return {
            "artifact_name": artifact_name,
            "available": False,
            "revisions": revisions,
        }
    latest = revisions[-1]
    previous = revisions[-2]
    return {
        "artifact_name": artifact_name,
        "available": True,
        "latest": latest,
        "previous": previous,
        "content_a": previous.get("content", ""),
        "content_b": latest.get("content", ""),
        "diff": latest.get("diff", ""),
    }
