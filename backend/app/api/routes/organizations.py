"""Organization endpoints — create and read the organization structure (Story 8.1)."""

from fastapi import APIRouter, HTTPException

from ...organization import service
from ...organization.models import CreateOrganizationRequest

router = APIRouter(prefix="/api", tags=["organizations"])

_NAME_MAX_LENGTH = 200


@router.post("/organizations", status_code=201)
async def create_organization(request: CreateOrganizationRequest) -> dict:
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
    organization = service.create_organization(name, request.description)
    return {"organization": organization.model_dump()}


@router.get("/organizations")
async def list_organizations() -> dict:
    """List all organizations, most recently updated first, with counts."""
    organizations = service.list_organizations()
    return {
        "organizations": [o.model_dump() for o in organizations],
        "count": len(organizations),
    }


@router.get("/organizations/{org_id}")
async def get_organization(org_id: str) -> dict:
    """Fetch a single organization tree by id. Returns 404 if unknown."""
    organization = service.get_organization(org_id)
    if organization is None:
        raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
    return {"organization": organization.model_dump()}
