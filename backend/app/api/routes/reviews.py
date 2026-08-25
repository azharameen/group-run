"""Accuracy review endpoints (Story 10.3)."""

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from ...work_items import reviews
from ...work_items.models import AccuracyReviewRequest
from ...work_items.service import UnknownWorkItemError

router = APIRouter(prefix="/api", tags=["reviews"])


@router.get("/work-items/{work_item_id}/reviews")
async def list_reviews(work_item_id: str) -> dict:
    try:
        records = await reviews.list_reviews(work_item_id)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to load reviews") from exc
    return {"reviews": [r.model_dump() for r in records], "count": len(records)}


@router.post("/work-items/{work_item_id}/reviews", status_code=201)
async def create_review(work_item_id: str, request: AccuracyReviewRequest) -> dict:
    try:
        record = await reviews.record_review(request, work_item_id)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to record review") from exc
    return {"review": record.model_dump()}
