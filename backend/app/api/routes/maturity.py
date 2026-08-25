"""Idea maturity stage endpoints — forward-only, human-attested transitions."""

import re
from collections.abc import Callable

import anyio.to_thread
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ...services.idea_maturity import (
    MATURITY_STAGES,
    STAGE_CRITERIA,
    InvalidTransitionError,
    UnknownIdeaError,
    get_maturity,
    transition_stage,
)

router = APIRouter(prefix="/api", tags=["ideas"])
_ID_RE = re.compile(r"^[A-Z0-9-]+$")
_MAX_LIST_ITEMS = 50
_MAX_ITEM_LENGTH = 500


class MaturityTransitionRequest(BaseModel):
    """Request body for recording a maturity stage transition."""

    stage: str = Field(..., max_length=50)
    criteria: list[str] = Field(..., min_length=1, max_length=_MAX_LIST_ITEMS)
    evidence_refs: list[str] = Field(..., min_length=1, max_length=_MAX_LIST_ITEMS)
    recorded_by: str = Field(default="user", max_length=100)

    @field_validator("stage")
    @classmethod
    def _known_stage(cls, value: str) -> str:
        if value not in MATURITY_STAGES:
            raise ValueError(f"stage must be one of {list(MATURITY_STAGES)}")
        return value

    @field_validator("criteria", "evidence_refs")
    @classmethod
    def _non_blank_items(cls, value: list[str]) -> list[str]:
        items = [item.strip() for item in value]
        if not items or any(not item for item in items):
            raise ValueError("list must contain non-blank entries")
        if any(len(item) > _MAX_ITEM_LENGTH for item in items):
            raise ValueError(f"entries must be at most {_MAX_ITEM_LENGTH} characters")
        return items


def _validate_idea_id(idea_id: str) -> str:
    if len(idea_id) > 64 or not _ID_RE.match(idea_id):
        raise HTTPException(status_code=400, detail="Invalid idea_id format")
    return idea_id


async def _run(func: Callable, *args) -> dict:
    """Run a maturity service function in a worker thread, mapping errors."""
    try:
        return await anyio.to_thread.run_sync(func, *args)
    except UnknownIdeaError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/ideas/{idea_id}/maturity")
async def get_idea_maturity(idea_id: str) -> dict:
    """Return the idea's maturity stage, next stage, and transition history."""
    _validate_idea_id(idea_id)
    maturity = await _run(get_maturity, idea_id)
    return {
        "idea_id": idea_id,
        "stage": maturity["stage"],
        "current": maturity["current"],
        "history": maturity["history"],
        "next_stage": maturity["next_stage"],
        "stage_criteria": STAGE_CRITERIA,
    }


@router.post("/ideas/{idea_id}/maturity", status_code=201)
async def record_maturity_transition(idea_id: str, payload: MaturityTransitionRequest) -> dict:
    """Record a one-step forward transition, attested by a human."""
    _validate_idea_id(idea_id)
    result = await _run(transition_stage, idea_id, payload.model_dump())
    return {"idea_id": idea_id, "stage": result["stage"], "record": result["record"]}
