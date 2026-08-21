"""Idea workspace persistence helpers."""

import os
import shutil
import tempfile
from contextlib import contextmanager
from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any

from ..config import WORKSPACE_DIR
from ..models.transcript import normalize_transcript_event
from .base import read_yaml, write_yaml


def idea_folder_path(idea_id: str) -> str:
    if ".." in idea_id or "/" in idea_id or "\\" in idea_id or "\x00" in idea_id:
        raise ValueError(f"Invalid idea_id: {idea_id}")
    ideas_root = os.path.abspath(os.path.join(WORKSPACE_DIR, "ideas"))
    path = os.path.abspath(os.path.join(ideas_root, idea_id))
    try:
        if os.path.commonpath([ideas_root, path]) != ideas_root:
            raise ValueError(f"Invalid idea_id: {idea_id}")
    except ValueError:
        raise ValueError(f"Invalid idea_id: {idea_id}") from None
    return path


@contextmanager
def workspace_transaction(idea_id: str) -> Generator[str, None, None]:
    """Context manager wrapping multi-step workspace operations in a transaction.

    If an exception occurs within the block, any workspace state changes for idea_id
    are rolled back to the pre-transaction state.
    """
    folder = idea_folder_path(idea_id)
    existed = os.path.exists(folder)
    backup_dir = None

    if existed:
        backup_dir = tempfile.mkdtemp(prefix=f"workspace_bak_{idea_id}_")
        shutil.rmtree(backup_dir)  # copytree expects target not to exist
        shutil.copytree(folder, backup_dir)

    try:
        yield folder
    except Exception:
        if existed:
            if os.path.exists(folder):
                shutil.rmtree(folder)
            shutil.copytree(backup_dir, folder)
        else:
            if os.path.exists(folder):
                shutil.rmtree(folder)
        raise
    finally:
        if backup_dir and os.path.exists(backup_dir):
            shutil.rmtree(backup_dir)


def load_idea_yaml(idea_id: str, filename: str) -> Any | None:
    path = os.path.join(idea_folder_path(idea_id), filename)
    if not os.path.exists(path):
        return None
    return read_yaml(path)


def save_idea_yaml(idea_id: str, filename: str, data: Any):
    with workspace_transaction(idea_id):
        write_yaml(os.path.join(idea_folder_path(idea_id), filename), data)


def create_idea_folder(idea_id: str) -> str:
    with workspace_transaction(idea_id):
        folder = idea_folder_path(idea_id)
        os.makedirs(folder, exist_ok=True)
        os.makedirs(os.path.join(folder, "handovers"), exist_ok=True)
        os.makedirs(os.path.join(folder, "revisions"), exist_ok=True)
        return folder


def write_changelog_entry(idea_id: str, entry: str):
    with workspace_transaction(idea_id):
        path = os.path.join(idea_folder_path(idea_id), "revisions", "changelog.md")
        timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        content = ""
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                content = handle.read()
        content += f"\n## {timestamp}\n{entry}\n---\n"
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)


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
    with workspace_transaction(idea_id):
        path = _pending_interrupts_path(idea_id)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_yaml(path, interrupts)
        return interrupts


def save_comment(idea_id: str, author: str, text: str) -> dict:
    with workspace_transaction(idea_id):
        comments = load_comments(idea_id)
        entry = {
            "author": author,
            "text": text,
            "timestamp": datetime.now(UTC).isoformat(),
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
    with workspace_transaction(idea_id):
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
            except Exception:  # noqa: BLE001  # binary/unreadable files are listed with a placeholder
                content = "<binary file or unreadable content>"

            files.append(
                {
                    "path": rel_path,
                    "filename": filename,
                    "ext": ext,
                    "size_bytes": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                    "content": content,
                }
            )
    return files
