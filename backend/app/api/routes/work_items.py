"""Work item endpoints — submit, list and read work items (Story 8.2).

Storage failures map to 500; 400 covers blank or over-long titles and
descriptions;
404 covers unknown organizations and missing work items.
"""

import sqlite3

from fastapi import APIRouter, HTTPException

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
def submit_work_item(request: SubmitWorkItemRequest) -> dict:
    """Submit a work item; the Chief of Staff receives and routes it.

    Returns the created work item including its routing decision
    (status ``new``, owner ``chief_of_staff``).
    """
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
            detail=(
                f"Work item description must be at most"
                f" {_DESCRIPTION_MAX_LENGTH} characters"
            ),
        )
    try:
        item = service.submit_work_item(
            title,
            description,
            org_id=request.org_id,
            department=request.department,
            source=request.source or "api",
        )
    except (UnknownOrganizationError, NoOrganizationError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (sqlite3.Error, OrganizationIntegrityError) as exc:
        raise HTTPException(status_code=500, detail="Failed to create work item") from exc
    return {"work_item": item.model_dump()}


@router.get("/work-items")
def list_work_items(org_id: str | None = None) -> dict:
    """List work items, newest first.

    ``org_id`` filters to one organization (404 when unknown); omitted
    it lists across all organizations.
    """
    try:
        if org_id is not None and org_service.get_organization(org_id) is None:
            raise HTTPException(
                status_code=404, detail=f"Organization {org_id} not found"
            )
        items = service.list_work_items(org_id)
    except (sqlite3.Error, OrganizationIntegrityError) as exc:
        raise HTTPException(status_code=500, detail="Failed to list work items") from exc
    return {"work_items": [i.model_dump() for i in items], "count": len(items)}


@router.get("/work-items/{work_item_id}")
def get_work_item(work_item_id: str) -> dict:
    """Fetch a single work item with its routing decision. 404 if missing."""
    try:
        item = service.get_work_item(work_item_id)
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Failed to load work item") from exc
    if item is None:
        raise HTTPException(status_code=404, detail=f"Work item {work_item_id} not found")
    return {"work_item": item.model_dump()}


@router.post("/work-items/{work_item_id}/transitions", status_code=201)
async def transition_work_item(work_item_id: str, request: TransitionWorkItemRequest) -> dict:
    """Advance a work item to a later lifecycle phase."""
    try:
        item, event = service.transition_work_item(
            work_item_id, request.status, request.reasoning, request.decided_by
        )
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        status_code = 409 if isinstance(exc, InvalidTransitionError) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except (sqlite3.Error, OrganizationIntegrityError) as exc:
        raise HTTPException(status_code=500, detail="Failed to transition work item") from exc
    return {"work_item": item.model_dump(), "event": event.model_dump()}


@router.get("/work-items/{work_item_id}/lifecycle")
async def lifecycle_history(work_item_id: str) -> dict:
    """Return the complete lifecycle history, including creation."""
    try:
        events = service.get_lifecycle_history(work_item_id)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Failed to load lifecycle history") from exc
    return {"events": [event.model_dump() for event in events], "count": len(events)}
