"""Idea CRUD endpoints — pure filesystem-backed operations."""
import logging
import re
import threading
from datetime import UTC, datetime

import anyio.to_thread
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...agent.teams.idea_validation import validation_status
from ...storage.idea_workspace import create_idea_folder
from ...storage.registry import load_idea_registry, save_idea_registry
from ...storage.yaml_io import (
    archive_idea_folder,
    delete_idea_folder,
    get_all_idea_files,
    load_comments,
    load_idea_yaml,
    remove_from_registry,
    save_comment,
    save_idea_yaml,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["ideas"])
_ID_RE = re.compile(r"^[A-Z0-9-]+$")
_UPDATE_FIELDS = {"title", "signal_text"}
_idea_lock = threading.Lock()

def _validate_idea_id(idea_id: str) -> str:
    if len(idea_id) > 64 or not _ID_RE.match(idea_id):
        raise HTTPException(status_code=400, detail="Invalid idea_id format")
    return idea_id

def _idea_exists(idea_id: str) -> dict:
    data = load_idea_yaml(idea_id, "idea.yaml")
    if not isinstance(data, dict):
        raise HTTPException(status_code=404, detail=f"Idea {idea_id} not found")
    return data

def _now() -> str:
    return datetime.now(UTC).isoformat()

class CreateIdeaRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    signal_text: str | None = Field(default="Autonomous discovery", max_length=5000)

class UpdateIdeaRequest(BaseModel):
    field: str = Field(..., max_length=50)
    value: str = Field(..., max_length=5000)

class AddCommentRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    author: str | None = Field(default="User", max_length=100)

def _generate_idea_id() -> str:
    """Generate a unique idea ID."""
    reg = load_idea_registry()
    idea_id = f"IDEA-{reg.get('next_id', 1):04d}"
    reg["next_id"] = reg.get("next_id", 1) + 1
    save_idea_registry(reg)
    return idea_id

def _register_idea(idea_id: str, title: str, signal_text: str):
    reg = load_idea_registry()
    reg["ideas"].append({
        "idea_id": idea_id, "title": title or "Untitled",
        "signal_text": signal_text, "created_at": _now(),
    })
    save_idea_registry(reg)

def _list_ideas_sync() -> dict:
    ideas_list = load_idea_registry().get("ideas", [])
    result = []
    for entry in ideas_list:
        idea = load_idea_yaml(entry["idea_id"], "idea.yaml")
        if not isinstance(idea, dict):
            continue
        result.append({
            "idea_id": entry["idea_id"],
            "title": idea.get("title", entry.get("title", "")),
            "created_at": idea.get("created_at", ""),
            "updated_at": idea.get("updated_at", ""),
        })
    return {"ideas": result, "count": len(result)}

def _get_idea_sync(idea_id: str) -> dict:
    return {"idea": _idea_exists(idea_id), "comments": load_comments(idea_id)}

def _get_idea_files_sync(idea_id: str) -> dict:
    _idea_exists(idea_id)
    files = get_all_idea_files(idea_id)
    return {"idea_id": idea_id, "files": files, "count": len(files)}

def _create_idea_sync(payload_title: str | None, payload_signal_text: str | None) -> dict:
    with _idea_lock:
        reg = load_idea_registry()
        next_id = reg.get("next_id", 1)
        idea_id = f"IDEA-{next_id:04d}"
        reg["next_id"] = next_id + 1
        create_idea_folder(idea_id)
        now = _now()
        title = payload_title or "Untitled"
        signal_text = payload_signal_text or "Autonomous discovery"
        idea_data = {
            "idea_id": idea_id,
            "title": title,
            "signal_text": signal_text,
            "created_at": now,
            "updated_at": now,
        }
        save_idea_yaml(idea_id, "idea.yaml", idea_data)
        reg.setdefault("ideas", []).append({
            "idea_id": idea_id,
            "title": payload_title or "",
            "signal_text": signal_text,
            "created_at": now,
        })
        save_idea_registry(reg)
        return {"idea_id": idea_id, "message": f"Idea {idea_id} created"}

def _update_idea_sync(idea_id: str, field: str, value: str) -> dict:
    with _idea_lock:
        idea_data = _idea_exists(idea_id)
        idea_data[field] = value
        idea_data["updated_at"] = _now()
        save_idea_yaml(idea_id, "idea.yaml", idea_data)
        return {"idea_id": idea_id, "field": field, "updated": True}

def _delete_idea_sync(idea_id: str) -> dict:
    with _idea_lock:
        _idea_exists(idea_id)
        # Remove from registry first to avoid zombie folders if deletion fails
        remove_from_registry(idea_id)
        try:
            delete_idea_folder(idea_id)
        except Exception:  # registry already removed; folder cleanup failure is non-fatal
            logger.debug("Idea folder cleanup failed for %s", idea_id, exc_info=True)
        return {"idea_id": idea_id, "deleted": True, "message": f"Idea {idea_id} deleted"}

def _archive_idea_sync(idea_id: str) -> dict:
    with _idea_lock:
        _idea_exists(idea_id)
        archive_path = archive_idea_folder(idea_id)
        if not archive_path:
            raise HTTPException(status_code=500, detail=f"Archive failed for {idea_id}")
        # Remove from registry first, then delete source folder
        remove_from_registry(idea_id)
        try:
            delete_idea_folder(idea_id)
        except Exception:  # archive already saved; source-folder cleanup failure is non-fatal
            logger.debug("Idea folder cleanup failed after archive for %s", idea_id, exc_info=True)
        return {"idea_id": idea_id, "archived": True, "archive_path": archive_path, "message": f"Idea {idea_id} archived"}

def _add_comment_sync(idea_id: str, author: str, text: str) -> dict:
    with _idea_lock:
        _idea_exists(idea_id)
        return {"idea_id": idea_id, "comment": save_comment(idea_id, author, text)}

@router.get("/ideas")
async def list_ideas() -> dict:
    return await anyio.to_thread.run_sync(_list_ideas_sync)

@router.get("/ideas/{idea_id}")
async def get_idea(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    return await anyio.to_thread.run_sync(_get_idea_sync, idea_id)

@router.get("/ideas/{idea_id}/files")
async def get_idea_files(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    return await anyio.to_thread.run_sync(_get_idea_files_sync, idea_id)


@router.get("/ideas/{idea_id}/validation")
async def get_idea_validation(idea_id: str) -> dict:
    """Read novelty validation metadata for an idea directly."""
    _validate_idea_id(idea_id)
    _idea_exists(idea_id)
    return {
        "idea_id": idea_id,
        "validation": await anyio.to_thread.run_sync(validation_status, idea_id),
    }

@router.post("/ideas")
async def create_idea(payload: CreateIdeaRequest) -> dict:
    return await anyio.to_thread.run_sync(_create_idea_sync, payload.title, payload.signal_text)

@router.post("/ideas/{idea_id}/update")
async def update_idea(idea_id: str, payload: UpdateIdeaRequest) -> dict:
    _validate_idea_id(idea_id)
    if payload.field not in _UPDATE_FIELDS:
        raise HTTPException(status_code=400, detail=f"Field '{payload.field}' not writable. Allowed: {_UPDATE_FIELDS}")
    return await anyio.to_thread.run_sync(_update_idea_sync, idea_id, payload.field, payload.value)

@router.delete("/ideas/{idea_id}")
async def delete_idea(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    return await anyio.to_thread.run_sync(_delete_idea_sync, idea_id)

@router.post("/ideas/{idea_id}/archive")
async def archive_idea(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    return await anyio.to_thread.run_sync(_archive_idea_sync, idea_id)

@router.post("/ideas/{idea_id}/comment")
async def add_comment(idea_id: str, payload: AddCommentRequest) -> dict:
    _validate_idea_id(idea_id)
    author = str(payload.author or "User").strip() or "User"
    return await anyio.to_thread.run_sync(_add_comment_sync, idea_id, author, payload.text)
