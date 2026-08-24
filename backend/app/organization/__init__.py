"""Organization domain module.

Contains Pydantic models for the organization hierarchy,
pinned default structure (models), PostgreSQL storage (repository), and the
deterministic health evaluation logic (health.py).
"""

from .models import (
    DEFAULT_ORG_STRUCTURE,
    AgentStatus,
    CreateOrganizationRequest,
    OrgAgent,
    Organization,
    OrganizationSummary,
    OrgDepartment,
    OrgTeam,
)

__all__ = [
    "DEFAULT_ORG_STRUCTURE",
    "AgentStatus",
    "CreateOrganizationRequest",
    "OrgAgent",
    "OrgDepartment",
    "OrgTeam",
    "Organization",
    "OrganizationSummary",
]
