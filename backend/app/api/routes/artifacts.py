"""Artifact provenance and review endpoints."""

from typing import Any

import anyio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...agent.domain_tools import record_approval_decision
from ...storage.artifacts import build_artifact_comparison, load_artifact_revisions
from ...storage.yaml_io import load_idea_yaml

router = APIRouter(prefix="/api", tags=["artifacts"])


class RecordReviewRequest(BaseModel):
    """Request body for recording an idea review."""

    reviewer_role: str = Field(..., min_length=1, max_length=100)
    decision: str = Field(..., min_length=1, max_length=50)
    comments: str = Field(default="", max_length=2000)


def _ensure_idea(idea_id: str) -> None:
    if load_idea_yaml(idea_id, "idea.yaml") is None:
        raise HTTPException(status_code=404, detail=f"Idea {idea_id} not found")


@router.get("/ideas/{idea_id}/revisions")
async def get_idea_revisions(idea_id: str) -> dict[str, Any]:
    """Return all persisted artifact revisions for an idea."""
    await anyio.to_thread.run_sync(_ensure_idea, idea_id)
    revisions = await anyio.to_thread.run_sync(load_artifact_revisions, idea_id)
    return {"idea_id": idea_id, "revisions": revisions, "count": len(revisions)}


@router.get("/ideas/{idea_id}/artifacts/{artifact_name}/diff")
async def get_artifact_diff(idea_id: str, artifact_name: str) -> dict[str, Any]:
    """Return a comparison of the two latest revisions of an artifact."""
    await anyio.to_thread.run_sync(_ensure_idea, idea_id)
    return await anyio.to_thread.run_sync(build_artifact_comparison, idea_id, artifact_name)


@router.post("/ideas/{idea_id}/review")
async def record_idea_review(idea_id: str, request: RecordReviewRequest) -> dict[str, Any]:
    """Persist a reviewer decision in the idea workspace."""
    await anyio.to_thread.run_sync(_ensure_idea, idea_id)
    return await anyio.to_thread.run_sync(
        record_approval_decision,
        idea_id,
        request.reviewer_role,
        request.decision,
        request.comments,
    )
