import json
import uuid
from datetime import UTC, datetime

from ..organization import service as org_service
from ..organization.models import Organization
from . import repository
from .lifecycle import LIFECYCLE_PHASES, PHASE_DEPARTMENT
from .mapping import row_to_work_item
from .models import (
    OWNER_AGENT_ID,
    STATUS_NEW,
    LifecycleEvent,
    RoutingDecision,
    WorkItem,
)

DEFAULT_ROUTING_DEPARTMENT = "ideation"
class UnknownOrganizationError(LookupError): pass
class NoOrganizationError(LookupError): pass
class UnknownWorkItemError(LookupError): pass
class InvalidTransitionError(ValueError): pass
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
    return row_to_work_item(rows) if rows else None
def list_work_items(org_id: str | None = None) -> list[WorkItem]:
    """Return work items, newest first. ``org_id=None`` lists all orgs."""
    rows = repository.list_work_items_with_routing(org_id)
    return [
        work_item
        for work_item in (row_to_work_item(row) for row in rows)
        if work_item is not None
    ]
def _parse_alternatives(raw: object) -> list[str]:
    """Decode a persisted alternatives JSON column, tolerating corrupt data."""
    try:
        value = json.loads(raw if isinstance(raw, str) else "[]")
        return value if isinstance(value, list) else []
    except (TypeError, ValueError):
        return []
def transition_work_item(
    work_item_id: str,
    status: str,
    reasoning: str = "",
    decided_by: str = OWNER_AGENT_ID,
) -> tuple[WorkItem, LifecycleEvent]:
    """Advance an item and persist its provenance in one transaction."""
    item = get_work_item(work_item_id)
    if item is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    if status not in LIFECYCLE_PHASES:
        raise ValueError(f"Invalid status '{status}'. Valid statuses: {', '.join(LIFECYCLE_PHASES)}")
    current_index = LIFECYCLE_PHASES.index(item.status)
    target_index = LIFECYCLE_PHASES.index(status)
    if target_index <= current_index:
        raise InvalidTransitionError(
            f"Cannot transition work item from '{item.status}' to '{status}'; target must be later"
        )
    to_department = PHASE_DEPARTMENT[status]
    handoff = item.department_id != to_department
    actual_decider = OWNER_AGENT_ID if handoff else decided_by
    confidence = "high" if decided_by == OWNER_AGENT_ID or handoff else "low"
    if not reasoning.strip():
        reasoning = f"Transitioned from {item.status} to {status}."
        if handoff:
            reasoning += f" Handoff from {item.department_id} to {to_department}."
    event = LifecycleEvent(
        event_id=str(uuid.uuid4()),
        work_item_id=work_item_id,
        event_type="handoff" if handoff else "transition",
        from_status=item.status,
        to_status=status,
        from_department=item.department_id,
        to_department=to_department,
        decided_by=actual_decider,
        decided_at=datetime.now(UTC).isoformat(),
        confidence=confidence,
        reasoning=reasoning.strip(),
        alternatives=[phase for phase in LIFECYCLE_PHASES[target_index + 1 :]],
    )
    try:
        repository.record_transition(
            work_item_id, status, to_department, datetime.now(UTC).isoformat(), event.model_dump()
        )
    except ValueError as exc:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found") from exc
    updated = get_work_item(work_item_id)
    if updated is None:
        raise RuntimeError(f"Work item {work_item_id} vanished after transition")
    return updated, event
def get_lifecycle_history(work_item_id: str) -> list[LifecycleEvent]:
    """Return creation plus persisted lifecycle events oldest first."""
    rows = repository.get_work_item_rows(work_item_id)
    if rows is None or rows["routing"] is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    item = rows["item"]
    stored_rows = repository.list_lifecycle_events(work_item_id)
    first_department = (
        stored_rows[0]["from_department"] if stored_rows else rows["routing"]["department_id"]
    )
    created = LifecycleEvent(
        event_id=f"created-{work_item_id}",
        work_item_id=work_item_id,
        event_type="created",
        from_status="",
        to_status=STATUS_NEW,
        from_department="",
        to_department=first_department,
        decided_by=rows["routing"]["decided_by"],
        decided_at=item["created_at"],
        confidence=rows["routing"]["confidence"],
        reasoning=rows["routing"]["reasoning"],
        alternatives=_parse_alternatives(rows["routing"]["alternatives"]),
    )
    events = [created]
    for row in stored_rows:
        events.append(LifecycleEvent(**{**dict(row), "alternatives": _parse_alternatives(row["alternatives"])}))
    return events
