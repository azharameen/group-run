"""Organization endpoints — create and read the organization structure (Story 8.1).

Storage failures map to 500 (review P5); 404/400 cover unknown orgs and
invalid names.
"""

import sqlite3

from fastapi import APIRouter, HTTPException, Path

from ...organization import health, service
from ...organization.models import CreateOrganizationRequest
from ...organization.service import OrganizationIntegrityError

router = APIRouter(prefix="/api", tags=["organizations"])

_NAME_MAX_LENGTH = 200


@router.post("/organizations", status_code=201)
def create_organization(request: CreateOrganizationRequest) -> dict:
    """Create an organization initialized with the pinned default structure.

    Returns the full organization tree. Rejects blank or over-long names
    with 400.
    """
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
        organization = service.create_organization(name, request.description)
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Failed to create organization"
        ) from exc
    return {"organization": organization.model_dump()}


@router.get("/organizations")
def list_organizations() -> dict:
    """List all organizations, most recently updated first, with counts."""
    try:
        organizations = service.list_organizations()
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Failed to list organizations"
        ) from exc
    return {
        "organizations": [o.model_dump() for o in organizations],
        "count": len(organizations),
    }


@router.get("/organizations/{org_id}")
def get_organization(org_id: str = Path(..., max_length=64)) -> dict:
    """Fetch a single organization tree by id. Returns 404 if unknown."""
    try:
        organization = service.get_organization(org_id)
    except (sqlite3.Error, OrganizationIntegrityError) as exc:
        raise HTTPException(
            status_code=500, detail="Failed to load organization"
        ) from exc
    if organization is None:
        raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
    return {"organization": organization.model_dump()}


@router.get("/organizations/{org_id}/health")
def get_organization_health(org_id: str = Path(..., max_length=64)) -> dict:
    """Fetch the organization health snapshot (Story 9.1). Returns 404 if unknown."""
    try:
        organization_health = health.get_organization_health(org_id)
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Failed to load organization health"
        ) from exc
    if organization_health is None:
        raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
    return {"health": organization_health.model_dump()}
