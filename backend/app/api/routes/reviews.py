"""Accuracy review endpoints (Story 10.3)."""

import sqlite3

from fastapi import APIRouter, HTTPException

from ...work_items import reviews
from ...work_items.models import AccuracyReviewRequest
from ...work_items.service import UnknownWorkItemError

router = APIRouter(prefix="/api", tags=["reviews"])


@router.get("/work-items/{work_item_id}/reviews")
def list_reviews(work_item_id: str) -> dict:
    try:
        records = reviews.list_reviews(work_item_id)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Failed to load reviews") from exc
    return {"reviews": [r.model_dump() for r in records], "count": len(records)}


@router.post("/work-items/{work_item_id}/reviews", status_code=201)
def create_review(work_item_id: str, request: AccuracyReviewRequest) -> dict:
    try:
        record = reviews.record_review(request, work_item_id)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Failed to record review") from exc
    return {"review": record.model_dump()}
