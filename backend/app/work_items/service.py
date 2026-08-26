"""Work items domain service."""

import json
import uuid
from datetime import UTC, datetime

from ..organization import service as org_service
from ..organization.models import Organization
from . import repository
from .idea_mapping import (
    ensure_idea_for_work_item,
    get_idea_id_for_work_item,
    validate_work_item_id,
)
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


async def _resolve_organization(org_id: str | None) -> Organization:
    if org_id is not None:
        organization = await org_service.get_organization(org_id)
        if organization is None:
            raise UnknownOrganizationError(f"Organization {org_id} not found")
        return organization
    summaries = await org_service.list_organizations()
    if not summaries:
        raise NoOrganizationError("No organization exists. Create an organization first.")
    organization = await org_service.get_organization(summaries[0].org_id)
    if organization is None:
        raise NoOrganizationError("No organization exists. Create an organization first.")
    return organization


def _route(department_hint: str | None, organization: Organization) -> RoutingDecision:
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


async def submit_work_item(
    title: str,
    description: str = "",
    org_id: str | None = None,
    department: str | None = None,
    source: str = "api",
    template_id: str | None = None,
) -> WorkItem:
    if not title.strip():
        raise ValueError("Work item title must be a non-empty string")
    organization = await _resolve_organization(org_id)
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
        "template_id": template_id,
        "created_at": now,
        "updated_at": now,
    }
    routing = decision.model_dump()
    await repository.insert_work_item(item, routing)
    created = await get_work_item(item["work_item_id"])
    if created is None:
        raise RuntimeError(f"Work item {item['work_item_id']} vanished after creation")
    return created


async def get_work_item(work_item_id: str) -> WorkItem | None:
    validate_work_item_id(work_item_id)
    rows = await repository.get_work_item_rows(work_item_id)
    return row_to_work_item(rows) if rows else None


async def list_work_items(org_id: str | None = None) -> list[WorkItem]:
    rows = await repository.list_work_items_with_routing(org_id)
    return [
        work_item
        for work_item in (row_to_work_item(row) for row in rows)
        if work_item is not None
    ]


async def run_work_item_validation(
    work_item_id: str,
    *,
    validator=None,
    time_budget_sec: int | None = None,
    agent_id: str = "idea-team-validator",
) -> tuple[str | None, dict]:
    """Run validation for the idea mapped to a work item without changing lifecycle."""
    validate_work_item_id(work_item_id)
    item = await get_work_item(work_item_id)
    if item is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    idea_id = get_idea_id_for_work_item(work_item_id)
    if not idea_id:
        return None, {
            "state": "failed",
            "idea_id": "",
            "work_item_id": work_item_id,
            "expected_artifacts": ["novelty-assessment"],
            "completed_artifacts": [],
            "error": "No idea is mapped to this work item",
            "retryable": False,
        }
    from ..agent.teams.idea_validation import run_idea_validation

    result = await run_idea_validation(
        idea_id,
        f"{item.title}\n{item.description}",
        validator=validator,
        time_budget_sec=time_budget_sec,
        agent_id=agent_id,
        work_item_id=work_item_id,
    )
    return idea_id, result


def get_work_item_validation(work_item_id: str) -> tuple[str | None, dict]:
    """Read validation state from the mapped idea's canonical workspace."""
    validate_work_item_id(work_item_id)
    idea_id = get_idea_id_for_work_item(work_item_id)
    if not idea_id:
        return None, {
            "state": "unknown",
            "idea_id": "",
            "work_item_id": work_item_id,
            "expected_artifacts": ["novelty-assessment"],
            "completed_artifacts": [],
        }
    from ..agent.teams.idea_validation import validation_status

    return idea_id, validation_status(idea_id, work_item_id)


def _parse_alternatives(raw: object) -> list[str]:
    try:
        value = json.loads(raw if isinstance(raw, str) else "[]")
        return value if isinstance(value, list) else []
    except (TypeError, ValueError):
        return []


async def transition_work_item(
    work_item_id: str,
    status: str,
    reasoning: str = "",
    decided_by: str = OWNER_AGENT_ID,
) -> tuple[WorkItem, LifecycleEvent]:
    validate_work_item_id(work_item_id)
    item = await get_work_item(work_item_id)
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
        await repository.record_transition(
            work_item_id,
            status,
            to_department,
            datetime.now(UTC).isoformat(),
            event.model_dump(),
            expected_status=item.status,
            decision={
                "decision_id": str(uuid.uuid4()),
                "work_item_id": work_item_id,
                "agent_id": actual_decider,
                "decision_type": event.event_type,
                "reasoning": event.reasoning,
                "evidence": [],
                "confidence": event.confidence,
                "alternatives": event.alternatives,
                "decided_at": event.decided_at,
            },
        )
    except ValueError as exc:
        if "status changed concurrently" in str(exc):
            raise InvalidTransitionError(str(exc)) from exc
        raise UnknownWorkItemError(f"Work item {work_item_id} not found") from exc
    updated = await get_work_item(work_item_id)
    if updated is None:
        raise RuntimeError(f"Work item {work_item_id} vanished after transition")
    if status == "ideation":
        # Keep the lifecycle transition authoritative while making research
        # deterministic and observable; failures are recorded in the workspace.
        from ..agent.teams.idea_team import run_idea_research

        idea_id = ensure_idea_for_work_item(
            work_item_id,
            title=updated.title,
            description=updated.description,
        )
        await run_idea_research(
            idea_id,
            f"{updated.title}\n{updated.description}",
            work_item_id=work_item_id,
        )
    return updated, event


async def get_lifecycle_history(work_item_id: str) -> list[LifecycleEvent]:
    rows = await repository.get_work_item_rows(work_item_id)
    if rows is None or rows["routing"] is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    item = rows["item"]
    stored_rows = await repository.list_lifecycle_events(work_item_id)
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
        events.append(
            LifecycleEvent(
                **{**dict(row), "alternatives": _parse_alternatives(row["alternatives"])}
            )
        )
    return events
