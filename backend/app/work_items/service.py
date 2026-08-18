"""Service layer for work item submission and routing (Story 8.2).

The Chief of Staff receives every submitted work item. Routing is
deterministic and total (no LLM in the hot path): an explicit department
hint that matches one of the org's departments wins with high confidence;
anything else falls back to the first lifecycle-phase department
(ideation, PRD FR-4) with low confidence. Every decision persists with
provenance so the assignment is explainable (PRD FR-3, AC-3).
"""

import json
import uuid
from datetime import UTC, datetime

from ..organization import service as org_service
from ..organization.models import Organization
from . import repository
from .models import (
    OWNER_AGENT_ID,
    STATUS_NEW,
    RoutingDecision,
    WorkItem,
)

#: Default routing target — the first lifecycle phase (PRD FR-4) —
#: used whenever the hint is missing or does not match a department.
DEFAULT_ROUTING_DEPARTMENT = "ideation"


class UnknownOrganizationError(LookupError):
    """Raised when an explicitly submitted org_id does not exist."""


class NoOrganizationError(LookupError):
    """Raised when a work item is submitted but no organization exists."""


def _resolve_organization(org_id: str | None) -> Organization:
    """Resolve the target organization for a new work item.

    An explicit id must exist; an omitted id resolves to the most
    recently updated organization (same rule as the frontend views).
    """
    if org_id is not None:
        organization = org_service.get_organization(org_id)
        if organization is None:
            raise UnknownOrganizationError(f"Organization {org_id} not found")
        return organization
    summaries = org_service.list_organizations()
    if not summaries:
        raise NoOrganizationError("No organization exists. Create an organization first.")
    organization = org_service.get_organization(summaries[0].org_id)
    if organization is None:
        raise NoOrganizationError("No organization exists. Create an organization first.")
    return organization


def _route(department_hint: str | None, organization: Organization) -> RoutingDecision:
    """Compute the deterministic routing decision (total — never fails)."""
    department_ids = [dept.department_id for dept in organization.departments]
    decided_at = datetime.now(UTC).isoformat()
    hint = (department_hint or "").strip()
    if hint and hint in department_ids:
        return RoutingDecision(
            department_id=hint,
            decided_by=OWNER_AGENT_ID,
            decided_at=decided_at,
            confidence="high",
            reasoning=f"Explicitly assigned to the {hint} department by the submitter.",
            alternatives=[dept for dept in department_ids if dept != hint],
        )
    fallback = (
        DEFAULT_ROUTING_DEPARTMENT
        if DEFAULT_ROUTING_DEPARTMENT in department_ids
        else department_ids[0]
    )
    if hint:
        reasoning = (
            f"Department hint '{hint}' does not match any department;"
            f" routed to the default {fallback} department."
        )
    else:
        reasoning = (
            f"No department specified; routed to the default {fallback}"
            " department (first lifecycle phase)."
        )
    return RoutingDecision(
        department_id=fallback,
        decided_by=OWNER_AGENT_ID,
        decided_at=decided_at,
        confidence="low",
        reasoning=reasoning,
        alternatives=[dept for dept in department_ids if dept != fallback],
    )


def _row_to_work_item(rows: dict) -> WorkItem | None:
    """Assemble a WorkItem from stored rows, or None if incomplete."""
    item = rows["item"]
    routing_row = rows["routing"]
    if routing_row is None:
        return None
    return WorkItem(
        work_item_id=item["work_item_id"],
        org_id=item["org_id"],
        title=item["title"],
        description=item["description"],
        status=item["status"],
        owner_agent_id=item["owner_agent_id"],
        source=item["source"],
        department_id=routing_row["department_id"],
        routing=RoutingDecision(
            department_id=routing_row["department_id"],
            decided_by=routing_row["decided_by"],
            decided_at=routing_row["decided_at"],
            confidence=routing_row["confidence"],
            reasoning=routing_row["reasoning"],
            alternatives=json.loads(routing_row["alternatives"]),
        ),
        created_at=item["created_at"],
        updated_at=item["updated_at"],
    )


def submit_work_item(
    title: str,
    description: str = "",
    org_id: str | None = None,
    department: str | None = None,
    source: str = "api",
) -> WorkItem:
    """Create a work item owned by the Chief of Staff and route it.

    The item is created with status ``new``; the routing decision is
    deterministic (see :func:`_route`) and persisted in the same
    transaction as the item itself.
    """
    if not title.strip():
        raise ValueError("Work item title must be a non-empty string")
    organization = _resolve_organization(org_id)
    decision = _route(department, organization)
    now = datetime.now(UTC).isoformat()
    item = {
        "work_item_id": str(uuid.uuid4()),
        "org_id": organization.org_id,
        "title": title.strip(),
        "description": description.strip(),
        "status": STATUS_NEW,
        "owner_agent_id": OWNER_AGENT_ID,
        "source": source,
        "created_at": now,
        "updated_at": now,
    }
    routing = decision.model_dump()
    repository.insert_work_item(item, routing)
    created = get_work_item(item["work_item_id"])
    if created is None:
        raise RuntimeError(f"Work item {item['work_item_id']} vanished after creation")
    return created


def get_work_item(work_item_id: str) -> WorkItem | None:
    """Return one work item with its routing decision, or None."""
    rows = repository.get_work_item_rows(work_item_id)
    return _row_to_work_item(rows) if rows else None


def list_work_items(org_id: str | None = None) -> list[WorkItem]:
    """Return work items, newest first. ``org_id=None`` lists all orgs."""
    rows = repository.list_work_items_with_routing(org_id)
    return [
        work_item
        for work_item in (_row_to_work_item(row) for row in rows)
        if work_item is not None
    ]
