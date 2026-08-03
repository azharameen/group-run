"""Idea CRUD endpoints — pure filesystem-backed operations."""

from typing import Optional

from fastapi import APIRouter, HTTPException

from ...storage.yaml_io import (
    archive_idea_folder,
    delete_idea_folder,
    get_all_idea_files,
    load_comments,
    load_idea_yaml,
    load_pending_interrupts,
    load_transcript_events,
    remove_from_registry,
    save_comment,
    save_idea_yaml,
    save_pending_interrupts,
)
from ...storage.idea_workspace import create_idea_folder, idea_folder_path
from ...storage.registry import load_idea_registry, save_idea_registry
from ...storage.artifacts import load_artifact_revisions, build_artifact_comparison


router = APIRouter(prefix="/api/ideas", tags=["ideas"])


def _generate_idea_id() -> str:
    """Generate the next idea ID from the registry."""
    registry = load_idea_registry()
    next_id = registry.get("next_id", 1)
    idea_id = f"IDEA-{next_id:04d}"
    registry["next_id"] = next_id + 1
    save_idea_registry(registry)
    return idea_id


def _register_idea(idea_id: str, title: str, signal_text: str):
    """Add an idea entry to the registry."""
    registry = load_idea_registry()
    registry["ideas"].append(
        {
            "idea_id": idea_id,
            "title": title or "Untitled",
            "signal_text": signal_text,
            "created_at": "",
        }
    )
    save_idea_registry(registry)


# ── List / Get ────────────────────────────────────────────────────────────

@router.get("")
async def list_ideas(
    phase: Optional[str] = None,
    state: Optional[str] = None,
    min_score: Optional[float] = None,
) -> dict:
    registry = load_idea_registry()
    ideas_list = registry.get("ideas", [])

    result = []
    for entry in ideas_list:
        idea_id = entry["idea_id"]
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}

        if phase and idea_data.get("phase") != phase:
            continue
        if state and idea_data.get("current_state") != state:
            continue
        if min_score is not None:
            scores = load_idea_yaml(idea_id, "scores.yaml") or {}
            composite = scores.get("latest", {}).get("composite", 0)
            if (composite or 0) < min_score:
                continue

        result.append(
            {
                "idea_id": idea_id,
                "title": idea_data.get("title", entry.get("title", "")),
                "phase": idea_data.get("phase", "discovery"),
                "state": idea_data.get("current_state", ""),
                "created_at": idea_data.get("created_at", ""),
                "updated_at": idea_data.get("updated_at", ""),
            }
        )

    return {"ideas": result, "count": len(result)}


@router.get("/{idea_id}")
async def get_idea(idea_id: str) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail=f"Idea {idea_id} not found")

    return {
        "idea": idea_data,
        "state": load_idea_yaml(idea_id, "state.yaml") or {},
        "scores": load_idea_yaml(idea_id, "scores.yaml") or {},
        "comments": load_comments(idea_id),
        "transcript_events": load_transcript_events(idea_id),
    }


@router.get("/{idea_id}/files")
async def get_idea_files(idea_id: str) -> dict:
    files = get_all_idea_files(idea_id)
    return {"idea_id": idea_id, "files": files, "count": len(files)}


# ── Create ────────────────────────────────────────────────────────────────

@router.post("")
async def create_new_idea(payload: dict) -> dict:
    from datetime import datetime

    signal_text = payload.get("signal_text", "")
    title = payload.get("title", "")

    if not signal_text:
        signal_text = "Autonomous discovery"

    idea_id = _generate_idea_id()
    create_idea_folder(idea_id)

    idea_data = {
        "idea_id": idea_id,
        "title": title or "Untitled",
        "signal_text": signal_text,
        "phase": "discovery",
        "current_state": "",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    save_idea_yaml(idea_id, "idea.yaml", idea_data)
    _register_idea(idea_id, title, signal_text)

    return {
        "idea_id": idea_id,
        "message": f"Idea {idea_id} created",
    }


# ── Update ────────────────────────────────────────────────────────────────

@router.post("/{idea_id}/update")
async def update_idea(idea_id: str, payload: dict) -> dict:
    from datetime import datetime

    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    field = payload.get("field", "")
    value = payload.get("value")
    if field:
        idea_data[field] = value
    idea_data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)

    return {"idea_id": idea_id, "field": field, "updated": True}


@router.post("/{idea_id}/evidence")
async def add_evidence_endpoint(idea_id: str, payload: dict) -> dict:
    from datetime import datetime

    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    evidence = idea_data.get("evidence", [])
    evidence.append(
        {
            "source": payload.get("source", ""),
            "content": payload.get("content", ""),
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    idea_data["evidence"] = evidence
    idea_data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)

    return {"idea_id": idea_id, "evidence_count": len(evidence)}


# ── Revisions / Artifacts ────────────────────────────────────────────────

@router.get("/{idea_id}/revisions")
async def get_idea_revisions(idea_id: str) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return {
        "idea_id": idea_id,
        "revisions": load_artifact_revisions(idea_id),
    }


@router.get("/{idea_id}/artifacts/{artifact_name}/diff")
async def get_artifact_diff(idea_id: str, artifact_name: str) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return build_artifact_comparison(idea_id, artifact_name)


# ── Interrupts (HITL pending actions) ────────────────────────────────────

@router.get("/{idea_id}/interrupts")
async def get_pending_interrupts(idea_id: str) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return {
        "idea_id": idea_id,
        "interrupts": load_pending_interrupts(idea_id),
    }


@router.post("/{idea_id}/interrupts")
async def add_pending_interrupt(idea_id: str, payload: dict) -> dict:
    from datetime import datetime

    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    interrupts = load_pending_interrupts(idea_id)
    interrupts.append(
        {
            "action": payload.get("action", ""),
            "description": payload.get("description", ""),
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    save_pending_interrupts(idea_id, interrupts)

    return {
        "idea_id": idea_id,
        "interrupts": interrupts,
    }


# ── Delete / Archive ─────────────────────────────────────────────────────

@router.delete("/{idea_id}")
async def delete_idea_endpoint(idea_id: str) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    delete_idea_folder(idea_id)
    remove_from_registry(idea_id)

    return {
        "idea_id": idea_id,
        "deleted": True,
        "message": f"Idea {idea_id} deleted",
    }


@router.post("/{idea_id}/archive")
async def archive_idea_endpoint(idea_id: str) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    archive_path = archive_idea_folder(idea_id)
    remove_from_registry(idea_id)

    return {
        "idea_id": idea_id,
        "archived": True,
        "archive_path": archive_path or "",
        "message": f"Idea {idea_id} archived",
    }


# ── Pause / Resume ───────────────────────────────────────────────────────

@router.post("/{idea_id}/pause")
async def pause_idea_endpoint(idea_id: str) -> dict:
    from datetime import datetime

    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    idea_data["paused_processing"] = True
    idea_data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)

    return {"idea_id": idea_id, "paused": True}


@router.post("/{idea_id}/resume")
async def resume_idea_endpoint(idea_id: str) -> dict:
    from datetime import datetime

    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    idea_data["paused_processing"] = False
    idea_data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)

    return {"idea_id": idea_id, "paused": False}


# ── Comments ─────────────────────────────────────────────────────────────

@router.post("/{idea_id}/comment")
async def add_comment_endpoint(idea_id: str, payload: dict) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    author = str(payload.get("author", "User")).strip() or "User"
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")
    comment = save_comment(idea_id, author, text)
    return {"idea_id": idea_id, "comment": comment}
