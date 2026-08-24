"""Work item endpoints — submit, list and read work items (Story 8.2).

Storage failures map to 500; 400 covers blank or over-long titles and descriptions;
404 covers unknown organizations and missing work items.
"""

from fastapi import APIRouter, HTTPException, Path, Query
from sqlalchemy.exc import SQLAlchemyError

from ...organization import service as org_service
from ...organization.service import OrganizationIntegrityError
from ...work_items import service
from ...work_items.models import SubmitWorkItemRequest, TransitionWorkItemRequest
from ...work_items.service import (
    InvalidTransitionError,
    NoOrganizationError,
    UnknownOrganizationError,
    UnknownWorkItemError,
)

router = APIRouter(prefix="/api", tags=["work-items"])

_TITLE_MAX_LENGTH = 200
_DESCRIPTION_MAX_LENGTH = 5000


@router.post("/work-items", status_code=201)
async def submit_work_item(request: SubmitWorkItemRequest) -> dict:
    """Submit a work item; the Chief of Staff receives and routes it."""
    title = request.title.strip()
    if not title:
        raise HTTPException(
            status_code=400, detail="Work item title must be a non-empty string"
        )
    if len(title) > _TITLE_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Work item title must be at most {_TITLE_MAX_LENGTH} characters",
        )
    description = request.description.strip()
    if len(description) > _DESCRIPTION_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Work item description must be at most {_DESCRIPTION_MAX_LENGTH} characters",
        )
    try:
        item = await service.submit_work_item(
            title,
            description,
            org_id=request.org_id,
            department=request.department,
            template_id=request.template_id,
        )
    except (UnknownOrganizationError, NoOrganizationError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (SQLAlchemyError, OrganizationIntegrityError) as exc:
        raise HTTPException(
            status_code=500, detail="Failed to submit work item"
        ) from exc
    return {"work_item": item.model_dump()}


@router.get("/work-items")
async def list_work_items(
    org_id: str | None = Query(default=None, max_length=64)
) -> dict:
    """List work items, optionally filtered by org_id."""
    try:
        if org_id is not None:
            org = await org_service.get_organization(org_id)
            if org is None:
                raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
        items = await service.list_work_items(org_id=org_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to list work items"
        ) from exc
    return {"work_items": [item.model_dump() for item in items], "count": len(items)}


@router.get("/work-items/{work_item_id}")
async def get_work_item(work_item_id: str = Path(..., max_length=64)) -> dict:
    """Fetch a single work item with its routing decision."""
    try:
        item = await service.get_work_item(work_item_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to load work item"
        ) from exc
    if item is None:
        raise HTTPException(
            status_code=404, detail=f"Work item {work_item_id} not found"
        )
    return {"work_item": item.model_dump()}


@router.post("/work-items/{work_item_id}/transition", status_code=201)
@router.post("/work-items/{work_item_id}/transitions", status_code=201)
async def transition_work_item(
    request: TransitionWorkItemRequest,
    work_item_id: str = Path(..., max_length=64),
) -> dict:
    """Advance a work item's status through its lifecycle."""
    try:
        item, event = await service.transition_work_item(
            work_item_id,
            request.status,
            reasoning=request.reasoning,
            decided_by=request.decided_by,
        )
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to transition work item"
        ) from exc
    return {"work_item": item.model_dump(), "event": event.model_dump()}


@router.get("/work-items/{work_item_id}/history")
@router.get("/work-items/{work_item_id}/lifecycle")
async def get_work_item_history(work_item_id: str = Path(..., max_length=64)) -> dict:
    """Return the audit trail of lifecycle events for a work item."""
    try:
        events = await service.get_lifecycle_history(work_item_id)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to load work item history"
        ) from exc
    return {
        "events": [event.model_dump() for event in events],
        "history": [event.model_dump() for event in events],
        "count": len(events),
    }
