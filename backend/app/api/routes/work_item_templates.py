"""Workflow template endpoints — save, list, replay (Story 9.3)."""

from fastapi import APIRouter, HTTPException, Path, Query
from sqlalchemy.exc import SQLAlchemyError

from ...organization import service as org_service
from ...work_items import templates as templates_service
from ...work_items.models import ReplayTemplateRequest, SaveTemplateRequest
from ...work_items.service import UnknownWorkItemError

router = APIRouter(prefix="/api", tags=["work-item-templates"])

_NAME_MAX_LENGTH = 200
_TITLE_MAX_LENGTH = 200
_DESCRIPTION_MAX_LENGTH = 5000


@router.post("/work-items/{work_item_id}/template", status_code=201)
async def save_work_item_template(
    request: SaveTemplateRequest,
    work_item_id: str = Path(..., max_length=64),
) -> dict:
    """Save a work item as a template."""
    name = request.name.strip()
    if not name:
        raise HTTPException(
            status_code=400, detail="Template name must be a non-empty string"
        )
    if len(name) > _NAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Template name must be at most {_NAME_MAX_LENGTH} characters",
        )

    try:
        template = await templates_service.save_template(work_item_id, name)
    except UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to save template"
        ) from exc

    return {"template": template.model_dump()}


@router.get("/work-items/templates")
async def list_work_item_templates(
    org_id: str | None = Query(default=None, max_length=64)
) -> dict:
    """List workflow templates for an organization."""
    if org_id is None:
        raise HTTPException(
            status_code=400, detail="org_id query parameter is required"
        )

    try:
        if await org_service.get_organization(org_id) is None:
            raise HTTPException(
                status_code=404, detail=f"Organization {org_id} not found"
            )
        templates = await templates_service.list_templates(org_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to list templates"
        ) from exc

    return {
        "templates": [t.model_dump() for t in templates],
        "count": len(templates),
    }


@router.post("/work-items/templates/{template_id}/replay", status_code=201)
async def replay_work_item_template(
    request: ReplayTemplateRequest,
    template_id: str = Path(..., max_length=64),
) -> dict:
    """Replay a template to create a new work item."""
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
        item, events = await templates_service.replay_template(
            template_id, title, description
        )
    except templates_service.InvalidTemplateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to replay template"
        ) from exc

    return {
        "work_item": item.model_dump(),
        "events": [event.model_dump() for event in events],
        "count": len(events),
    }
