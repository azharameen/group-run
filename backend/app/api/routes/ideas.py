"""Idea CRUD and idea-scoped workflow endpoints."""

from typing import Optional

from fastapi import APIRouter, HTTPException

from ...orchestrator.tools import (
    add_evidence,
    advance_to_next_state,
    advance_workflow,
    create_idea,
    delete_idea,
    detect_duplicate_ideas,
    build_review_packet,
    score_idea,
    set_idea_paused,
    update_idea_field,
    validate_gate,
    get_prior_art_sources,
    get_filing_sources,
)
from ...orchestrator.workflow import pause_idea, resume_idea
from ...storage.yaml_io import (
    get_all_idea_files,
    load_comments,
    load_idea_registry,
    load_idea_yaml,
    load_knowledge_base,
    load_transcript_events,
    save_comment,
)
from ...storage.artifacts import load_artifact_revisions, build_artifact_comparison


router = APIRouter(prefix="/api/ideas", tags=["ideas"])


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
        scores = load_idea_yaml(idea_id, "scores.yaml") or {}
        latest_score = scores.get("latest", {})
        composite = latest_score.get("composite", 0)

        if phase and idea_data.get("phase") != phase:
            continue
        if state and idea_data.get("current_state") != state:
            continue
        if min_score is not None and (composite or 0) < min_score:
            continue

        result.append(
            {
                "idea_id": idea_id,
                "title": idea_data.get("title", entry.get("title", "")),
                "phase": idea_data.get("phase", "discovery"),
                "state": idea_data.get("current_state", "raw_signal_collected"),
                "composite_score": composite,
                "strength_rating": latest_score.get("strength_rating", ""),
                "running_agent": idea_data.get("running_agent", ""),
                "active_processing": idea_data.get("active_processing", False),
                "paused_processing": idea_data.get("paused_processing", False),
                "active_agent": idea_data.get("active_agent", ""),
                "active_state": idea_data.get("active_state", ""),
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


@router.post("")
async def create_new_idea(payload: dict) -> dict:
    signal_text = payload.get("signal_text", "")
    title = payload.get("title", "")
    duplicate_assessment = detect_duplicate_ideas(signal_text, title)

    if not signal_text:
        kb_docs = load_knowledge_base()
        if kb_docs:
            contexts: list[str] = []
            for doc in kb_docs[:3]:
                content = doc.get("content", "")
                if isinstance(content, str) and len(content) > 50:
                    contexts.append(content[:200])
            if contexts:
                signal_text = "Autonomous discovery from KB: " + " | ".join(contexts)
            else:
                signal_text = "Autonomous discovery (knowledge base)"
        else:
            signal_text = "Autonomous discovery (no KB documents found)"

    idea_id = create_idea(signal_text, title)
    if duplicate_assessment["is_duplicate"]:
        from ...storage.yaml_io import load_idea_yaml, save_idea_yaml
        data = load_idea_yaml(idea_id, "idea.yaml") or {}
        data["duplicate_assessment"] = duplicate_assessment
        data["duplicate_status"] = "review_required"
        save_idea_yaml(idea_id, "idea.yaml", data)
    score_result = score_idea(idea_id, "api-create")
    return {
        "idea_id": idea_id,
        "score": score_result,
        "duplicate_assessment": duplicate_assessment,
        "duplicate_status": "review_required" if duplicate_assessment["is_duplicate"] else "clear",
        "message": f"Idea {idea_id} created and scored",
    }


@router.post("/{idea_id}/advance")
async def advance_idea(idea_id: str, payload: Optional[dict] = None) -> dict:
    target = payload.get("target_state") if payload else None
    if target:
        return advance_workflow(idea_id, target)
    return advance_to_next_state(idea_id)


@router.post("/{idea_id}/score")
async def score_idea_endpoint(idea_id: str) -> dict:
    return score_idea(idea_id, "api-manual")


@router.post("/{idea_id}/validate-gate")
async def validate_gate_endpoint(idea_id: str, payload: dict) -> dict:
    return validate_gate(idea_id, payload.get("gate_name", ""))


@router.post("/{idea_id}/update")
async def update_idea(idea_id: str, payload: dict) -> dict:
    return update_idea_field(idea_id, payload.get("field", ""), payload.get("value", ""))


@router.post("/{idea_id}/evidence")
async def add_evidence_endpoint(idea_id: str, payload: dict) -> dict:
    return add_evidence(idea_id, payload.get("source", ""), payload.get("content", ""))


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


@router.post("/{idea_id}/review-packet")
async def create_review_packet(idea_id: str, payload: dict | None = None) -> dict:
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")
    reviewer_role = (payload or {}).get("reviewer_role", "reviewer")
    return build_review_packet(idea_id, reviewer_role)


@router.get("/research/prior-art")
async def research_prior_art(query: str, limit: int = 5) -> dict:
    return get_prior_art_sources(query, limit=limit)


@router.get("/research/filings")
async def research_filings(query: str, limit: int = 5) -> dict:
    return get_filing_sources(query, limit=limit)


@router.delete("/{idea_id}")
async def delete_idea_endpoint(idea_id: str) -> dict:
    return delete_idea(idea_id)


@router.post("/{idea_id}/pause")
async def pause_idea_endpoint(idea_id: str) -> dict:
    pause_idea(idea_id)
    return set_idea_paused(idea_id, True)


@router.post("/{idea_id}/resume")
async def resume_idea_endpoint(idea_id: str) -> dict:
    resume_idea(idea_id)
    return set_idea_paused(idea_id, False)


@router.post("/{idea_id}/comment")
async def add_comment_endpoint(idea_id: str, payload: dict) -> dict:
    author = str(payload.get("author", "User")).strip() or "User"
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")
    comment = save_comment(idea_id, author, text)
    return {"idea_id": idea_id, "comment": comment}
