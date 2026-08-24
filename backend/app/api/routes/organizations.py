"""Organization endpoints — create and read the organization structure (Story 8.1).

Storage failures map to 500; 404/400 cover unknown orgs and invalid names.
"""

from fastapi import APIRouter, HTTPException, Path
from sqlalchemy.exc import SQLAlchemyError

from ...organization import evaluate, health, service
from ...organization.models import CreateOrganizationRequest
from ...organization.service import OrganizationIntegrityError

router = APIRouter(prefix="/api", tags=["organizations"])

_NAME_MAX_LENGTH = 200


@router.post("/organizations", status_code=201)
async def create_organization(request: CreateOrganizationRequest) -> dict:
    """Create an organization initialized with the pinned default structure."""
    name = request.name.strip()
    if not name:
        raise HTTPException(
            status_code=400, detail="Organization name must be a non-empty string"
        )
    if len(name) > _NAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Organization name must be at most {_NAME_MAX_LENGTH} characters",
        )
    try:
        organization = await service.create_organization(name, request.description)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to create organization"
        ) from exc
    return {"organization": organization.model_dump()}


@router.get("/organizations")
async def list_organizations() -> dict:
    """List all organizations, most recently updated first, with counts."""
    try:
        organizations = await service.list_organizations()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to list organizations"
        ) from exc
    return {
        "organizations": [o.model_dump() for o in organizations],
        "count": len(organizations),
    }


@router.get("/organizations/{org_id}")
async def get_organization(org_id: str = Path(..., max_length=64)) -> dict:
    """Fetch a single organization tree by id. Returns 404 if unknown."""
    try:
        organization = await service.get_organization(org_id)
    except (SQLAlchemyError, OrganizationIntegrityError) as exc:
        raise HTTPException(
            status_code=500, detail="Failed to load organization"
        ) from exc
    if organization is None:
        raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
    return {"organization": organization.model_dump()}


@router.get("/organizations/{org_id}/health")
async def get_organization_health(org_id: str = Path(..., max_length=64)) -> dict:
    """Fetch the organization health snapshot (Story 9.1). Returns 404 if unknown."""
    try:
        organization_health = await health.get_organization_health(org_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to load organization health"
        ) from exc
    if organization_health is None:
        raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
    return {"health": organization_health.model_dump()}


@router.post("/organizations/{org_id}/evaluate", status_code=201)
async def evaluate_organization(org_id: str = Path(..., max_length=64)) -> dict:
    """Run the deterministic Chief of Staff evaluation (Story 9.2)."""
    try:
        evaluation = await evaluate.evaluate_organization(org_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to evaluate organization"
        ) from exc
    if evaluation is None:
        raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
    return {"evaluation": evaluation.model_dump()}


@router.get("/organizations/{org_id}/alerts")
async def list_organization_alerts(org_id: str = Path(..., max_length=64)) -> dict:
    """List the organization's escalation alerts (Story 9.2). 404 if unknown."""
    try:
        from ...organization import repository as org_repository
        from ...work_items import repository as work_items_repository

        if await org_repository.get_organization_rows(org_id) is None:
            raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
        rows = await work_items_repository.list_org_alerts(org_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail="Failed to list organization alerts"
        ) from exc
    alerts = [dict(row) for row in rows]
    return {"alerts": alerts, "count": len(alerts)}
