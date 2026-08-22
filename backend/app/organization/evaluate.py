"""Deterministic Chief of Staff evaluation (Story 9.2).

LLM-free pass over an organization's open work items: reassign items
owned by the org-level Chief of Staff or by an idle agent to the first
idle agent in the owning department, and raise a deduplicated escalation
alert for any item stuck in one phase beyond the configured threshold.
Every decision is recorded in the ``lifecycle_events`` audit trail.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel

from ..config import settings
from ..work_items import lifecycle
from ..work_items import repository as work_items_repository
from ..work_items.models import OWNER_AGENT_ID, OrgAlert
from . import repository as org_repository

_OPEN_PHASES = tuple(phase for phase in lifecycle.LIFECYCLE_PHASES if phase != "monitoring")


class ReassignmentAction(BaseModel):
    """One reassignment performed by the evaluation."""

    work_item_id: str
    from_agent_id: str
    to_agent_id: str
    department_id: str
    reason: str


class EvaluationResult(BaseModel):
    """The outcome of one evaluation run."""

    actions: list[ReassignmentAction] = []
    alerts: list[OrgAlert] = []


def _parse_timestamp(value: str) -> datetime:
    """Parse an ISO-8601 timestamp, tolerating a trailing ``Z``."""
    return datetime.fromisoformat(value)


def _age_hours(updated_at: str, now: datetime) -> float:
    """Return how many hours have elapsed since ``updated_at``."""
    return (now - _parse_timestamp(updated_at)).total_seconds() / 3600.0


def _first_idle_agent(org_id: str, department_id: str) -> str | None:
    """Return the first idle agent in a department by ``agent_id`` order.

    Org-level agents (NULL ``department_id``, e.g. the Chief of Staff) are
    never returned.
    """
    row = org_repository._get_conn().execute(
        "SELECT agent_id FROM agents"
        " WHERE org_id = ? AND department_id = ? AND status = 'idle'"
        " ORDER BY agent_id LIMIT 1",
        (org_id, department_id),
    ).fetchone()
    return row["agent_id"] if row else None


def _owner_status(org_id: str, owner_agent_id: str) -> str | None:
    """Return the stored status of an agent, or None when it is not an agent."""
    row = org_repository._get_conn().execute(
        "SELECT status FROM agents WHERE org_id = ? AND agent_id = ?",
        (org_id, owner_agent_id),
    ).fetchone()
    return row["status"] if row else None


def _open_work_items(org_id: str) -> list[Any]:
    """Return the org's open work items, oldest first."""
    placeholders = ",".join("?" for _ in _OPEN_PHASES)
    return work_items_repository._get_conn().execute(
        f"SELECT * FROM work_items WHERE org_id = ? AND status IN ({placeholders})"
        " ORDER BY created_at ASC, rowid ASC",
        (org_id, *_OPEN_PHASES),
    ).fetchall()


def _reassign(org_id: str, item: Any, now: str) -> ReassignmentAction:
    """Reassign one item to the first idle agent in its department."""
    to_agent_id = _first_idle_agent(org_id, item["department_id"])
    reason = (
        f"Reassigned from {item['owner_agent_id']} to {to_agent_id}: "
        f"owner was unowned or idle and {to_agent_id} has capacity in "
        f"{item['department_id']}."
    )
    event = {
        "event_id": str(uuid.uuid4()),
        "work_item_id": item["work_item_id"],
        "event_type": "reassignment",
        "from_status": item["status"],
        "to_status": item["status"],
        "from_department": item["department_id"],
        "to_department": item["department_id"],
        "decided_by": OWNER_AGENT_ID,
        "decided_at": now,
        "confidence": "high",
        "reasoning": reason,
        "alternatives": [],
    }
    work_items_repository.record_reassignment(
        item["work_item_id"], to_agent_id, now, event,
        previous_owner_agent_id=item["owner_agent_id"],
    )
    org_repository.update_agent_status(org_id, to_agent_id, "active")
    return ReassignmentAction(
        work_item_id=item["work_item_id"],
        from_agent_id=item["owner_agent_id"],
        to_agent_id=to_agent_id,
        department_id=item["department_id"],
        reason=reason,
    )


def _escalate(org_id: str, item: Any, now: str, age: float, extra_reason: str) -> OrgAlert | None:
    """Raise a deduplicated escalation alert for a stuck item, if none exists."""
    if work_items_repository.has_org_alert(org_id, item["work_item_id"], item["status"]):
        return None
    reason = (
        f"Work item stuck in '{item['status']}' for {age:.1f} hours, exceeding "
        f"the {settings.blocked_phase_threshold_hours} hour threshold."
        f"{extra_reason}"
    )
    alert = OrgAlert(
        alert_id=str(uuid.uuid4()),
        org_id=org_id,
        work_item_id=item["work_item_id"],
        phase=item["status"],
        reason=reason,
        raised_at=now,
    )
    event = {
        "event_id": str(uuid.uuid4()),
        "work_item_id": item["work_item_id"],
        "event_type": "escalation",
        "from_status": item["status"],
        "to_status": item["status"],
        "from_department": item["department_id"],
        "to_department": item["department_id"],
        "decided_by": OWNER_AGENT_ID,
        "decided_at": now,
        "confidence": "high",
        "reasoning": reason,
        "alternatives": [],
    }
    work_items_repository.record_escalation(alert.model_dump(), event)
    return alert


def evaluate_organization(org_id: str) -> EvaluationResult | None:
    """Run the deterministic Chief of Staff evaluation for one organization.

    Args:
        org_id: The organization to evaluate.

    Returns:
        The actions and alerts produced, or ``None`` when the organization
        does not exist.
    """
    if org_repository.get_organization_rows(org_id) is None:
        return None
    now_dt = datetime.now(UTC)
    now = now_dt.isoformat()
    result = EvaluationResult()
    for item in _open_work_items(org_id):
        owner = item["owner_agent_id"]
        owner_is_idle = _owner_status(org_id, owner) == "idle"
        no_capacity = ""
        if owner == OWNER_AGENT_ID or owner_is_idle:
            if _first_idle_agent(org_id, item["department_id"]) is not None:
                result.actions.append(_reassign(org_id, item, now))
            else:
                no_capacity = " No idle capacity in the owning department."
        age = _age_hours(item["updated_at"], now_dt)
        if age > settings.blocked_phase_threshold_hours:
            alert = _escalate(org_id, item, now, age, no_capacity)
            if alert is not None:
                result.alerts.append(alert)
    return result
