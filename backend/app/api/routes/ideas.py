"""Idea CRUD endpoints — pure filesystem-backed operations."""
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...storage.idea_workspace import create_idea_folder
from ...storage.registry import load_idea_registry, save_idea_registry
from ...storage.yaml_io import (
    archive_idea_folder, delete_idea_folder, get_all_idea_files,
    load_comments, load_idea_yaml, remove_from_registry,
    save_comment, save_idea_yaml,
)

router = APIRouter(prefix="/api", tags=["ideas"])
_ID_RE = re.compile(r"^[A-Z0-9-]+$")
_UPDATE_FIELDS = {"title", "signal_text"}

def _validate_idea_id(idea_id: str) -> str:
    if not _ID_RE.match(idea_id):
        raise HTTPException(status_code=400, detail="Invalid idea_id format")
    return idea_id

def _idea_exists(idea_id: str) -> dict:
    data = load_idea_yaml(idea_id, "idea.yaml")
    if not isinstance(data, dict):
        raise HTTPException(status_code=404, detail=f"Idea {idea_id} not found")
    return data

def _now() -> str:
    return datetime.utcnow().isoformat()

class CreateIdeaRequest(BaseModel):
    title: Optional[str] = None
    signal_text: Optional[str] = "Autonomous discovery"

class UpdateIdeaRequest(BaseModel):
    field: str
    value: str

class AddCommentRequest(BaseModel):
    text: str = Field(..., min_length=1)
    author: Optional[str] = "User"

def _generate_idea_id() -> str:
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

@router.get("/ideas")
async def list_ideas() -> dict:
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

@router.get("/ideas/{idea_id}")
async def get_idea(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    return {"idea": _idea_exists(idea_id), "comments": load_comments(idea_id)}

@router.get("/ideas/{idea_id}/files")
async def get_idea_files(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    _idea_exists(idea_id)
    files = get_all_idea_files(idea_id)
    return {"idea_id": idea_id, "files": files, "count": len(files)}

@router.post("/ideas")
async def create_idea(payload: CreateIdeaRequest) -> dict:
    idea_id = _generate_idea_id()
    create_idea_folder(idea_id)
    now = _now()
    idea_data = {
        "idea_id": idea_id, "title": payload.title or "Untitled",
        "signal_text": payload.signal_text or "Autonomous discovery",
        "created_at": now, "updated_at": now,
    }
    save_idea_yaml(idea_id, "idea.yaml", idea_data)
    _register_idea(idea_id, payload.title or "", payload.signal_text or "Autonomous discovery")
    return {"idea_id": idea_id, "message": f"Idea {idea_id} created"}

@router.post("/ideas/{idea_id}/update")
async def update_idea(idea_id: str, payload: UpdateIdeaRequest) -> dict:
    _validate_idea_id(idea_id)
    idea_data = _idea_exists(idea_id)
    if payload.field not in _UPDATE_FIELDS:
        raise HTTPException(status_code=400, detail=f"Field '{payload.field}' not writable. Allowed: {_UPDATE_FIELDS}")
    idea_data[payload.field] = payload.value
    idea_data["updated_at"] = _now()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)
    return {"idea_id": idea_id, "field": payload.field, "updated": True}

@router.delete("/ideas/{idea_id}")
async def delete_idea(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    _idea_exists(idea_id)
    delete_idea_folder(idea_id)
    remove_from_registry(idea_id)
    return {"idea_id": idea_id, "deleted": True, "message": f"Idea {idea_id} deleted"}

@router.post("/ideas/{idea_id}/archive")
async def archive_idea(idea_id: str) -> dict:
    _validate_idea_id(idea_id)
    _idea_exists(idea_id)
    archive_path = archive_idea_folder(idea_id)
    if not archive_path:
        raise HTTPException(status_code=500, detail=f"Archive failed for {idea_id}")
    remove_from_registry(idea_id)
    return {"idea_id": idea_id, "archived": True, "archive_path": archive_path, "message": f"Idea {idea_id} archived"}

@router.post("/ideas/{idea_id}/comment")
async def add_comment(idea_id: str, payload: AddCommentRequest) -> dict:
    _validate_idea_id(idea_id)
    _idea_exists(idea_id)
    author = str(payload.author or "User").strip() or "User"
    return {"idea_id": idea_id, "comment": save_comment(idea_id, author, payload.text)}
