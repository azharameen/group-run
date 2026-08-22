"""Decision provenance endpoints."""

import sqlite3

from fastapi import APIRouter, HTTPException, Query

from ...work_items import decisions
from ...work_items.models import RecordDecisionRequest
from ...work_items.service import UnknownWorkItemError

router = APIRouter(prefix="/api", tags=["decisions"])


@router.get("/work-items/decisions")
def list_decisions(
    work_item_id: str | None = Query(None),
    agent_id: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
) -> dict:
    try:
        records = decisions.list_decisions(work_item_id, agent_id, from_, to)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Failed to load decisions") from exc
    return {"decisions": [d.model_dump() for d in records], "count": len(records)}


@router.post("/work-items/decisions", status_code=201)
def create_decision(request: RecordDecisionRequest) -> dict:
    try:
        record = decisions.record_decision(request)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Failed to record decision") from exc
    return {"decision": record.model_dump()}
