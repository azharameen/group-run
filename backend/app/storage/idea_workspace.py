"""Idea workspace persistence helpers."""

import os
import shutil
from datetime import datetime, timezone
from typing import Any, Optional

from ..config import WORKSPACE_DIR
from ..models.transcript import normalize_transcript_event
from .base import read_yaml, write_markdown, write_yaml


def idea_folder_path(idea_id: str) -> str:
    return os.path.join(WORKSPACE_DIR, "ideas", idea_id)


def load_idea_yaml(idea_id: str, filename: str) -> Optional[Any]:
    path = os.path.join(idea_folder_path(idea_id), filename)
    if not os.path.exists(path):
        return None
    return read_yaml(path)


def save_idea_yaml(idea_id: str, filename: str, data: Any):
    write_yaml(os.path.join(idea_folder_path(idea_id), filename), data)


def create_idea_folder(idea_id: str) -> str:
    folder = idea_folder_path(idea_id)
    os.makedirs(folder, exist_ok=True)
    os.makedirs(os.path.join(folder, "handovers"), exist_ok=True)
    os.makedirs(os.path.join(folder, "revisions"), exist_ok=True)
    return folder


def write_changelog_entry(idea_id: str, entry: str):
    path = os.path.join(idea_folder_path(idea_id), "revisions", "changelog.md")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"\n## {timestamp}\n{entry}\n---\n")


def delete_idea_folder(idea_id: str) -> bool:
    folder = idea_folder_path(idea_id)
    if not os.path.exists(folder):
        return False
    shutil.rmtree(folder)
    return True


def archive_idea_folder(idea_id: str) -> str | None:
    folder = idea_folder_path(idea_id)
    if not os.path.exists(folder):
        return None

    archive_root = os.path.join(WORKSPACE_DIR, "archive", "ideas")
    archive_target = os.path.join(archive_root, idea_id)
    os.makedirs(os.path.dirname(archive_target), exist_ok=True)

    if os.path.exists(archive_target):
        shutil.rmtree(archive_target)

    shutil.copytree(folder, archive_target)
    return archive_target


def load_comments(idea_id: str) -> list[dict]:
    path = os.path.join(idea_folder_path(idea_id), "comments.yaml")
    if not os.path.exists(path):
        return []
    data = read_yaml(path)
    return data if isinstance(data, list) else []


def _pending_interrupts_path(idea_id: str) -> str:
    return os.path.join(idea_folder_path(idea_id), "interrupts.yaml")


def load_pending_interrupts(idea_id: str) -> list[dict]:
    path = _pending_interrupts_path(idea_id)
    if not os.path.exists(path):
        return []
    data = read_yaml(path)
    return data if isinstance(data, list) else []


def save_pending_interrupts(idea_id: str, interrupts: list[dict]) -> list[dict]:
    path = _pending_interrupts_path(idea_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_yaml(path, interrupts)
    return interrupts


def save_comment(idea_id: str, author: str, text: str) -> dict:
    comments = load_comments(idea_id)
    entry = {
        "author": author,
        "text": text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    comments.append(entry)
    write_yaml(os.path.join(idea_folder_path(idea_id), "comments.yaml"), comments)
    return entry


def load_transcript_events(idea_id: str) -> list[dict]:
    path = os.path.join(idea_folder_path(idea_id), "transcript.yaml")
    if not os.path.exists(path):
        return []
    data = read_yaml(path)
    return data if isinstance(data, list) else []


def save_transcript_event(idea_id: str, event: dict) -> dict:
    events = load_transcript_events(idea_id)
    normalized = normalize_transcript_event(idea_id, event)
    events.append(normalized)
    write_yaml(os.path.join(idea_folder_path(idea_id), "transcript.yaml"), events)
    return normalized


def get_all_idea_files(idea_id: str) -> list[dict]:
    folder = idea_folder_path(idea_id)
    files: list[dict] = []
    if not os.path.exists(folder):
        return files

    for root, _, filenames in os.walk(folder):
        for filename in sorted(filenames):
            file_path = os.path.join(root, filename)
            rel_path = os.path.relpath(file_path, folder).replace("\\", "/")
            ext = os.path.splitext(filename)[1].lower()
            stat = os.stat(file_path)
            try:
                with open(file_path, "r", encoding="utf-8") as handle:
                    content = handle.read()
            except Exception:
                content = "<binary file or unreadable content>"

            files.append(
                {
                    "path": rel_path,
                    "filename": filename,
                    "ext": ext,
                    "size_bytes": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "content": content,
                }
            )
    return files
