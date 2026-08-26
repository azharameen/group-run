"""Product-definition generation and Chief of Staff handoff endpoints."""

from fastapi import APIRouter, HTTPException, Path
from sqlalchemy.exc import SQLAlchemyError

from ...work_items import service
from ...work_items.idea_mapping import validate_work_item_id
from ...work_items.models import ProductDefinitionDecisionRequest, ProductDefinitionRequest

router = APIRouter(prefix="/api", tags=["product-definition"])


def _response(work_item_id: str, idea_id: str | None, definition: dict, lifecycle_status: str | None):
    return {
        "work_item_id": work_item_id,
        "idea_id": idea_id,
        "product_definition": definition,
        "lifecycle_status": lifecycle_status,
    }


@router.post("/work-items/{work_item_id}/product-definition")
@router.post("/work-items/{work_item_id}/product-definition/generate")
async def generate_product_definition(
    request: ProductDefinitionRequest | None = None,
    work_item_id: str = Path(..., max_length=64),
) -> dict:
    """Run Product Team generation after the Story 11.2 prerequisite gate."""
    try:
        validate_work_item_id(work_item_id)
        idea_id, definition = await service.run_work_item_product_definition(
            work_item_id,
            time_budget_sec=request.time_budget_sec if request else None,
            agent_id=request.agent_id if request else "product-team",
        )
        item = await service.get_work_item(work_item_id)
    except service.UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to generate product definition") from exc
    return _response(work_item_id, idea_id, definition, item.status if item else None)


@router.get("/work-items/{work_item_id}/product-definition")
async def read_product_definition(work_item_id: str = Path(..., max_length=64)) -> dict:
    """Read generation state, revision metadata, and approval state."""
    try:
        validate_work_item_id(work_item_id)
        idea_id, definition = service.get_work_item_product_definition(work_item_id)
        item = await service.get_work_item(work_item_id)
    except service.UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to load product definition") from exc
    if item is None:
        raise HTTPException(status_code=404, detail=f"Work item {work_item_id} not found")
    return _response(work_item_id, idea_id, definition, item.status)


@router.post("/work-items/{work_item_id}/product-definition/decision")
@router.post("/work-items/{work_item_id}/product-definition/approve")
@router.post("/work-items/{work_item_id}/product-definition/handoff")
async def decide_product_definition(
    request: ProductDefinitionDecisionRequest,
    work_item_id: str = Path(..., max_length=64),
) -> dict:
    """Record an explicit Chief of Staff review and approved handoff."""
    try:
        validate_work_item_id(work_item_id)
        idea_id, definition, event = await service.decide_product_definition(work_item_id, request)
        item = await service.get_work_item(work_item_id)
    except service.UnknownWorkItemError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.UnauthorizedProductDefinitionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (service.ProductDefinitionApprovalError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Failed to record product-definition decision") from exc
    return {
        **_response(work_item_id, idea_id, definition, item.status if item else None),
        "event": event.model_dump() if event else None,
    }
