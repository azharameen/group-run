"""Work items domain service."""

import asyncio
import json
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
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
    ProductDefinitionDecisionRequest,
    RoutingDecision,
    WorkItem,
)

DEFAULT_ROUTING_DEPARTMENT = "ideation"


class UnknownOrganizationError(LookupError): pass
class NoOrganizationError(LookupError): pass
class UnknownWorkItemError(LookupError): pass
class InvalidTransitionError(ValueError): pass
class UnauthorizedProductDefinitionError(PermissionError): pass
class ProductDefinitionApprovalError(ValueError): pass


@dataclass
class _DecisionLockEntry:
    lock: asyncio.Lock
    users: int = 0


_decision_locks: dict[str, _DecisionLockEntry] = {}
_decision_locks_guard = threading.Lock()


@asynccontextmanager
async def _product_definition_decision_lock(work_item_id: str):
    """Serialize one work item's product-definition decisions in this process."""
    with _decision_locks_guard:
        entry = _decision_locks.get(work_item_id)
        if entry is None:
            entry = _DecisionLockEntry(asyncio.Lock())
            _decision_locks[work_item_id] = entry
        entry.users += 1
    acquired = False
    try:
        await entry.lock.acquire()
        acquired = True
        yield
    finally:
        if acquired:
            entry.lock.release()
        with _decision_locks_guard:
            entry.users -= 1
            if entry.users == 0 and not entry.lock.locked() and _decision_locks.get(work_item_id) is entry:
                _decision_locks.pop(work_item_id, None)


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


async def run_work_item_product_definition(
    work_item_id: str,
    *,
    provider=None,
    time_budget_sec: int | None = None,
    agent_id: str = "product-team",
) -> tuple[str | None, dict]:
    """Generate a product definition for a mapped work item."""
    validate_work_item_id(work_item_id)
    item = await get_work_item(work_item_id)
    if item is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    idea_id = get_idea_id_for_work_item(work_item_id)
    if not idea_id:
        from ..agent.teams.product_team import record_unmapped_product_definition_failure

        failure = {
            "state": "failed",
            "idea_id": "",
            "work_item_id": work_item_id,
            "expected_artifacts": ["product-definition"],
            "completed_artifacts": [],
            "approval_state": "unreviewed",
            "error": "No idea is mapped to this work item",
            "retryable": False,
        }
        return None, record_unmapped_product_definition_failure(work_item_id, failure)
    from ..agent.teams.product_team import generate_product_definition

    result = await generate_product_definition(
        idea_id,
        work_item_id,
        f"{item.title}\n{item.description}",
        provider=provider,
        time_budget_sec=time_budget_sec,
        agent_id=agent_id,
    )
    return idea_id, result


def get_work_item_product_definition(work_item_id: str) -> tuple[str | None, dict]:
    """Read product-definition state from the mapped idea workspace."""
    validate_work_item_id(work_item_id)
    idea_id = get_idea_id_for_work_item(work_item_id)
    if not idea_id:
        from ..agent.teams.product_team import unmapped_product_definition_status

        return None, unmapped_product_definition_status(work_item_id)
    from ..agent.teams.product_team import product_definition_status

    return idea_id, product_definition_status(idea_id, work_item_id)


async def decide_product_definition(
    work_item_id: str,
    request: ProductDefinitionDecisionRequest,
) -> tuple[str, dict, LifecycleEvent | None]:
    """Record the Chief of Staff decision and optionally hand off to Technology."""
    async with _product_definition_decision_lock(work_item_id):
        idea_id = get_idea_id_for_work_item(work_item_id)
        if idea_id:
            from ..agent.teams.product_team import generation_lock

            async with generation_lock(idea_id):
                return await _decide_product_definition_locked(work_item_id, request)
        return await _decide_product_definition_locked(work_item_id, request)


async def _decide_product_definition_locked(
    work_item_id: str,
    request: ProductDefinitionDecisionRequest,
) -> tuple[str, dict, LifecycleEvent | None]:
    """Apply one decision after acquiring the per-work-item compare-and-set lock."""
    validate_work_item_id(work_item_id)
    if request.actor_id != OWNER_AGENT_ID:
        raise UnauthorizedProductDefinitionError(
            "Only the Chief of Staff may approve or reject a product-definition handoff"
        )
    # ``actor_id`` remains in the request for wire compatibility with existing
    # clients, but identity and audit attribution are server-owned.
    actor_id = OWNER_AGENT_ID
    item = await get_work_item(work_item_id)
    if item is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    if item.status != "product_definition":
        raise ProductDefinitionApprovalError(
            "Product-definition approval requires the work item to remain in product_definition"
        )
    idea_id = get_idea_id_for_work_item(work_item_id)
    if not idea_id:
        raise ProductDefinitionApprovalError("No idea is mapped to this work item")
    from ..agent.teams.product_team import product_definition_status

    status = product_definition_status(idea_id, work_item_id)
    summary = status.get("summary") if isinstance(status, dict) else None
    current_version = summary.get("artifact_version") if isinstance(summary, dict) else None
    if status.get("state") != "completed":
        raise ProductDefinitionApprovalError("A completed product definition is required")
    if status.get("approval_state") in {"approved", "rejected"}:
        raise ProductDefinitionApprovalError("This product definition has already been decided")
    if current_version != request.artifact_version:
        raise ProductDefinitionApprovalError("The product-definition revision is stale")

    now = datetime.now(UTC).isoformat()
    decision = {
        "decision_id": str(uuid.uuid4()),
        "work_item_id": work_item_id,
        "agent_id": actor_id,
        "decision_type": "handoff" if request.decision == "approve" else "review",
        "reasoning": request.reasoning.strip(),
        "evidence": [f"product-definition:v{request.artifact_version:02d}"],
        "confidence": "high",
        "alternatives": request.alternatives,
        "decided_at": now,
    }
    from ..storage.idea_workspace import load_idea_yaml, save_idea_yaml, workspace_transaction

    if request.decision == "reject":
        rejected_status = {
            **status,
            "approval_state": "rejected",
            "approval_decision": {
                "decision": "reject",
                "actor_id": actor_id,
                "reasoning": request.reasoning.strip(),
                "alternatives": request.alternatives,
                "artifact_version": request.artifact_version,
                "decided_at": now,
            },
            "updated_at": time.time(),
        }

        def persist_rejection() -> None:
            with workspace_transaction(idea_id):
                idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
                idea["product_definition"] = rejected_status
                save_idea_yaml(idea_id, "idea.yaml", idea)

        try:
            with workspace_transaction(idea_id):
                await repository.record_product_definition_decision_with_workspace(
                    decision,
                    persist_rejection,
                )
        except ValueError as exc:
            if "already recorded" in str(exc):
                raise ProductDefinitionApprovalError(
                    "This product-definition decision is stale"
                ) from exc
            raise
        return idea_id, rejected_status, None

    approved_status = {
        **status,
        "approval_state": "approved",
        "approval_decision": {
            "decision": "approve",
            "actor_id": actor_id,
            "reasoning": request.reasoning.strip(),
            "alternatives": request.alternatives,
            "artifact_version": request.artifact_version,
            "decided_at": now,
        },
        "updated_at": time.time(),
    }
    to_department = PHASE_DEPARTMENT["development"]
    event = LifecycleEvent(
        event_id=str(uuid.uuid4()),
        work_item_id=work_item_id,
        event_type="handoff",
        from_status=item.status,
        to_status="development",
        from_department=item.department_id,
        to_department=to_department,
        decided_by=actor_id,
        decided_at=now,
        confidence="high",
        reasoning=request.reasoning.strip(),
        alternatives=[
            phase
            for phase in LIFECYCLE_PHASES[LIFECYCLE_PHASES.index("development") + 1 :]
        ],
    )

    def persist_approval() -> None:
        with workspace_transaction(idea_id):
            idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
            idea["product_definition"] = approved_status
            save_idea_yaml(idea_id, "idea.yaml", idea)

    try:
        with workspace_transaction(idea_id):
            await repository.record_transition_with_workspace(
                work_item_id,
                "development",
                to_department,
                now,
                event.model_dump(),
                expected_status="product_definition",
                decision=decision,
                workspace_action=persist_approval,
            )
    except InvalidTransitionError as exc:
        if "decision" in str(exc):
            raise ProductDefinitionApprovalError(str(exc)) from exc
        raise
    except ValueError as exc:
        if "status changed concurrently" in str(exc):
            raise ProductDefinitionApprovalError(str(exc)) from exc
        if "already recorded" in str(exc):
            raise ProductDefinitionApprovalError(
                "This product-definition decision is stale"
            ) from exc
        raise
    return idea_id, approved_status, event


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
    decision_evidence: list[str] | None = None,
    *,
    product_definition_handoff: bool = False,
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
    if item.status == "product_definition" and PHASE_DEPARTMENT[status] == "technology":
        if decided_by != OWNER_AGENT_ID:
            raise InvalidTransitionError(
                "Product-definition handoff requires a completed product definition and explicit Chief of Staff approval before Technology"
            )
        idea_id = get_idea_id_for_work_item(work_item_id)
        if not idea_id:
            raise InvalidTransitionError(
                "A completed product definition and approval are required before Technology"
            )
        from ..agent.teams.product_team import product_definition_status

        definition = product_definition_status(idea_id, work_item_id)
        approval = definition.get("approval_decision")
        summary = definition.get("summary")
        expected_evidence = (
            [f"product-definition:v{summary['artifact_version']:02d}"]
            if isinstance(summary, dict) and summary.get("artifact_version")
            else []
        )
        if (
            definition.get("state") != "completed"
            or definition.get("approval_state") != "approved"
            or not isinstance(approval, dict)
            or approval.get("decision") != "approve"
            or approval.get("actor_id") != OWNER_AGENT_ID
            or approval.get("artifact_version") != (
                summary.get("artifact_version") if isinstance(summary, dict) else None
            )
            or not expected_evidence
            or (
                decision_evidence is not None
                and decision_evidence != expected_evidence
            )
        ):
            raise InvalidTransitionError(
                "Product-definition handoff requires a completed product definition and explicit Chief of Staff approval before Technology"
            )
        decision_evidence = decision_evidence or expected_evidence
        if not await repository.has_product_definition_approval(
            work_item_id,
            decision_evidence,
            agent_id=OWNER_AGENT_ID,
        ):
            raise InvalidTransitionError(
                "Product-definition handoff requires an audited Chief of Staff approval before Technology"
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
    transition_decision = None
    if not (
        item.status == "product_definition"
        and PHASE_DEPARTMENT[status] == "technology"
    ):
        transition_decision = {
            "decision_id": str(uuid.uuid4()),
            "work_item_id": work_item_id,
            "agent_id": actual_decider,
            "decision_type": event.event_type,
            "reasoning": event.reasoning,
            "evidence": decision_evidence or [],
            "confidence": event.confidence,
            "alternatives": event.alternatives,
            "decided_at": event.decided_at,
        }
    try:
        await repository.record_transition(
            work_item_id,
            status,
            to_department,
            datetime.now(UTC).isoformat(),
            event.model_dump(),
            expected_status=item.status,
            decision=transition_decision,
        )
    except ValueError as exc:
        if "status changed concurrently" in str(exc):
            raise InvalidTransitionError(str(exc)) from exc
        if "product-definition decision already recorded" in str(exc):
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
