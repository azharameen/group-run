"""Filesystem YAML/Markdown persistence layer."""

import os
import shutil
from datetime import datetime
from typing import Any, Optional

import yaml

from ..config import WORKSPACE_DIR, KNOWLEDGE_BASE_DIR


def read_yaml(path: str) -> Any:
    """Read and parse a YAML file."""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def write_yaml(path: str, data: Any):
    """Write data to a YAML file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def read_markdown(path: str) -> str:
    """Read a Markdown file."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_markdown(path: str, content: str):
    """Write content to a Markdown file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def load_idea_registry() -> dict:
    """Load the idea registry from workspace/ideas.yaml."""
    path = os.path.join(WORKSPACE_DIR, "ideas.yaml")
    if not os.path.exists(path):
        return {"ideas": [], "next_id": 1}
    return read_yaml(path)


def save_idea_registry(registry: dict):
    """Save the idea registry to workspace/ideas.yaml."""
    write_yaml(os.path.join(WORKSPACE_DIR, "ideas.yaml"), registry)


def idea_folder_path(idea_id: str) -> str:
    """Get the filesystem path for an idea's folder."""
    return os.path.join(WORKSPACE_DIR, "ideas", idea_id)


def load_idea_yaml(idea_id: str, filename: str) -> Optional[Any]:
    """Load a YAML file from an idea's folder."""
    path = os.path.join(idea_folder_path(idea_id), filename)
    if not os.path.exists(path):
        return None
    return read_yaml(path)


def save_idea_yaml(idea_id: str, filename: str, data: Any):
    """Save a YAML file to an idea's folder."""
    write_yaml(os.path.join(idea_folder_path(idea_id), filename), data)


def create_idea_folder(idea_id: str) -> str:
    """Create the folder structure for a new idea."""
    folder = idea_folder_path(idea_id)
    os.makedirs(folder, exist_ok=True)
    os.makedirs(os.path.join(folder, "handovers"), exist_ok=True)
    os.makedirs(os.path.join(folder, "revisions"), exist_ok=True)
    return folder


def write_changelog_entry(idea_id: str, entry: str):
    """Append a human-readable entry to the idea's changelog."""
    path = os.path.join(idea_folder_path(idea_id), "revisions", "changelog.md")
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"\n## {timestamp}\n{entry}\n---\n")


def write_handover(idea_id: str, from_state: str, to_state: str, content: str):
    """Write a structured handover packet for a state transition."""
    filename = f"{from_state}-to-{to_state}.md"
    path = os.path.join(idea_folder_path(idea_id), "handovers", filename)
    write_markdown(path, content)


def delete_idea_folder(idea_id: str) -> bool:
    """Delete an idea's entire workspace folder."""
    folder = idea_folder_path(idea_id)
    if not os.path.exists(folder):
        return False
    shutil.rmtree(folder)
    return True


def clear_idea_runtime_state(idea_id: str) -> None:
    """Clear runtime markers before deleting or pausing an idea."""
    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
    idea_data["active_processing"] = False
    idea_data["active_agent"] = ""
    idea_data["active_state"] = ""
    idea_data["active_message"] = ""
    idea_data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)


def remove_from_registry(idea_id: str) -> bool:
    """Remove an idea from the registry."""
    registry = load_idea_registry()
    before = len(registry.get("ideas", []))
    registry["ideas"] = [e for e in registry.get("ideas", []) if e.get("idea_id") != idea_id]
    if len(registry["ideas"]) < before:
        save_idea_registry(registry)
        return True
    return False


def load_comments(idea_id: str) -> list[dict]:
    """Load comments for an idea from its comments.yaml file."""
    path = os.path.join(idea_folder_path(idea_id), "comments.yaml")
    if not os.path.exists(path):
        return []
    data = read_yaml(path)
    return data if isinstance(data, list) else []


def save_comment(idea_id: str, author: str, text: str) -> dict:
    """Append a comment to the idea's comments.yaml."""
    comments = load_comments(idea_id)
    entry = {
        "author": author,
        "text": text,
        "timestamp": datetime.utcnow().isoformat(),
    }
    comments.append(entry)
    write_yaml(os.path.join(idea_folder_path(idea_id), "comments.yaml"), comments)
    return entry


def get_all_idea_files(idea_id: str) -> list[dict]:
    """Recursively discover and return all files in an idea's workspace folder."""
    folder = idea_folder_path(idea_id)
    files: list[dict] = []
    if not os.path.exists(folder):
        return files

    for root, _, filenames in os.walk(folder):
        for fname in sorted(filenames):
            fpath = os.path.join(root, fname)
            rel_path = os.path.relpath(fpath, folder).replace("\\", "/")
            ext = os.path.splitext(fname)[1].lower()
            stat = os.stat(fpath)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                content = "<binary file or unreadable content>"

            files.append({
                "path": rel_path,
                "filename": fname,
                "ext": ext,
                "size_bytes": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "content": content,
            })
    return files


def _load_documents_from_dir(root: str, source: str) -> list[dict]:
    docs: list[dict] = []
    if not os.path.exists(root):
        return docs

    for dirpath, _, filenames in os.walk(root):
        for fname in sorted(filenames):
            if not fname.endswith((".md", ".yaml", ".yml", ".txt")):
                continue

            fpath = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(fpath, KNOWLEDGE_BASE_DIR).replace("\\", "/")
            if fname.endswith(".md") or fname.endswith(".txt"):
                content = read_markdown(fpath)
            else:
                content = read_yaml(fpath)
            docs.append({
                "source": source,
                "path": rel_path,
                "filename": fname,
                "content": content,
            })
    return docs


def load_knowledge_base() -> list[dict]:
    """Load knowledge base documents from raw and processed sources."""
    docs: list[dict] = []
    docs.extend(_load_documents_from_dir(os.path.join(KNOWLEDGE_BASE_DIR, "raw"), "raw"))
    docs.extend(_load_documents_from_dir(os.path.join(KNOWLEDGE_BASE_DIR, "processed"), "processed"))
    return docs


def recover_from_filesystem() -> int:
    """Scan workspace/ideas/ for idea folders not yet registered in ideas.yaml."""
    registry = load_idea_registry()
    registered_ids = {e["idea_id"] for e in registry.get("ideas", [])}
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
                num = int(parts[1])
                if num >= max_id:
                    max_id = num + 1
            continue

        idea_yaml_path = os.path.join(folder_path, "idea.yaml")
        if not os.path.exists(idea_yaml_path):
            continue

        idea_data = read_yaml(idea_yaml_path)
        if not idea_data or not isinstance(idea_data, dict):
            continue

        registry["ideas"].append({
            "idea_id": idea_id,
            "title": idea_data.get("title", idea_id),
            "state": idea_data.get("current_state", "raw_signal_collected"),
            "phase": idea_data.get("phase", "discovery"),
            "created_at": idea_data.get("created_at", ""),
        })

        parts = idea_id.split("-")
        if len(parts) == 2 and parts[1].isdigit():
            num = int(parts[1])
            if num >= max_id:
                max_id = num + 1

        recovered += 1

    if recovered > 0:
        registry["next_id"] = max_id
        save_idea_registry(registry)

    return recovered
