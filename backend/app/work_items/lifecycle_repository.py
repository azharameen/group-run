"""PostgreSQL persistence helpers for lifecycle events.

All operations are fully async, using the shared SQLAlchemy AsyncSession pool.
"""

import json
from collections.abc import Callable
from typing import Any

from sqlalchemy import text

from ..db.session import get_session_factory


async def insert_lifecycle_event(event: dict[str, Any]) -> None:
    """Insert one lifecycle_events row (no commit \u2014 call within a session context)."""
    # Called by record_transition / record_reassignment / record_escalation
    # which manage their own sessions. We expose a standalone version here.
    async with get_session_factory()() as session:
        await _insert_lifecycle_event_in_session(session, event)
        await session.commit()


async def _insert_lifecycle_event_in_session(session: Any, event: dict[str, Any]) -> None:
    """Insert a lifecycle event within an already-open session (no commit)."""
    await session.execute(
        text(
            "INSERT INTO lifecycle_events "
            "(event_id, work_item_id, event_type, from_status, to_status, "
            "from_department, to_department, decided_by, decided_at, "
            "confidence, reasoning, alternatives) "
            "VALUES (:event_id, :work_item_id, :event_type, :from_status, :to_status, "
            ":from_department, :to_department, :decided_by, :decided_at, "
            ":confidence, :reasoning, :alternatives)"
        ),
        {
            **event,
            "alternatives": json.dumps(event.get("alternatives", [])),
        },
    )


async def list_lifecycle_events(work_item_id: str) -> list[dict[str, Any]]:
    """Return lifecycle event rows for one item, oldest first."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                "SELECT * FROM lifecycle_events WHERE work_item_id = :id "
                "ORDER BY decided_at ASC, event_id ASC"
            ),
            {"id": work_item_id},
        )
        rows = [dict(r) for r in result.mappings()]
    for row in rows:
        if isinstance(row.get("alternatives"), str):
            try:
                row["alternatives"] = json.loads(row["alternatives"])
            except (json.JSONDecodeError, TypeError):
                row["alternatives"] = []
    return rows


async def update_work_item_status(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    expected_status: str | None = None,
) -> None:
    """Update a work item's status and department_id.

    When ``expected_status`` is given, the update is guarded by an optimistic
    lock check \u2014 raises ValueError if the current status doesn't match.
    """
    async with get_session_factory()() as session:
        try:
            if expected_status is not None:
                result = await session.execute(
                    text(
                        "UPDATE work_items SET status = :status, department_id = :dept, "
                        "updated_at = :updated_at "
                        "WHERE work_item_id = :id AND status = :expected_status"
                    ),
                    {
                        "status": status,
                        "dept": department_id,
                        "updated_at": updated_at,
                        "id": work_item_id,
                        "expected_status": expected_status,
                    },
                )
            else:
                result = await session.execute(
                    text(
                        "UPDATE work_items SET status = :status, department_id = :dept, "
                        "updated_at = :updated_at WHERE work_item_id = :id"
                    ),
                    {
                        "status": status,
                        "dept": department_id,
                        "updated_at": updated_at,
                        "id": work_item_id,
                    },
                )
            if result.rowcount != 1:
                # Check whether the item even exists
                exists = await session.execute(
                    text("SELECT status FROM work_items WHERE work_item_id = :id"),
                    {"id": work_item_id},
                )
                row = exists.mappings().one_or_none()
                if row is None:
                    raise ValueError(f"Work item {work_item_id} not found")
                raise ValueError(
                    f"Work item {work_item_id} status changed concurrently "
                    f"(expected '{expected_status}', found '{row['status']}')"
                )
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def insert_org_alert(alert: dict[str, Any]) -> None:
    """Insert one org_alerts row (Story 9.2 escalation alert)."""
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text(
                    "INSERT INTO org_alerts (alert_id, org_id, work_item_id, phase, reason, raised_at) "
                    "VALUES (:alert_id, :org_id, :work_item_id, :phase, :reason, :raised_at)"
                ),
                {
                    "alert_id": alert["alert_id"],
                    "org_id": alert["org_id"],
                    "work_item_id": alert["work_item_id"],
                    "phase": alert["phase"],
                    "reason": alert["reason"],
                    "raised_at": alert["raised_at"],
                },
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def record_escalation(alert: dict[str, Any], event: dict[str, Any]) -> None:
    """Insert an escalation alert and its audit event atomically."""
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text(
                    "INSERT INTO org_alerts (alert_id, org_id, work_item_id, phase, reason, raised_at) "
                    "VALUES (:alert_id, :org_id, :work_item_id, :phase, :reason, :raised_at)"
                ),
                {
                    "alert_id": alert["alert_id"],
                    "org_id": alert["org_id"],
                    "work_item_id": alert["work_item_id"],
                    "phase": alert["phase"],
                    "reason": alert["reason"],
                    "raised_at": alert["raised_at"],
                },
            )
            await _insert_lifecycle_event_in_session(session, event)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def list_org_alerts(org_id: str) -> list[dict[str, Any]]:
    """Return all alerts for one organization, oldest first."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                "SELECT * FROM org_alerts WHERE org_id = :org_id "
                "ORDER BY raised_at ASC, alert_id ASC"
            ),
            {"org_id": org_id},
        )
        return [dict(r) for r in result.mappings()]


async def has_org_alert(org_id: str, work_item_id: str, phase: str) -> bool:
    """Return whether an alert already exists for (org, item, phase)."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                "SELECT 1 FROM org_alerts "
                "WHERE org_id = :org_id AND work_item_id = :work_item_id AND phase = :phase "
                "LIMIT 1"
            ),
            {"org_id": org_id, "work_item_id": work_item_id, "phase": phase},
        )
        return result.one_or_none() is not None


async def record_reassignment(
    work_item_id: str,
    owner_agent_id: str,
    updated_at: str,
    event: dict[str, Any],
    previous_owner_agent_id: str | None = None,
) -> None:
    """Update a work item's owner and record the reassignment event atomically."""
    async with get_session_factory()() as session:
        try:
            if previous_owner_agent_id is not None:
                result = await session.execute(
                    text(
                        "UPDATE work_items SET owner_agent_id = :owner, updated_at = :updated_at "
                        "WHERE work_item_id = :id AND owner_agent_id = :prev_owner"
                    ),
                    {
                        "owner": owner_agent_id,
                        "updated_at": updated_at,
                        "id": work_item_id,
                        "prev_owner": previous_owner_agent_id,
                    },
                )
            else:
                result = await session.execute(
                    text(
                        "UPDATE work_items SET owner_agent_id = :owner, updated_at = :updated_at "
                        "WHERE work_item_id = :id"
                    ),
                    {"owner": owner_agent_id, "updated_at": updated_at, "id": work_item_id},
                )
            if result.rowcount != 1:
                raise ValueError(f"Work item {work_item_id} not found")
            await _insert_lifecycle_event_in_session(session, event)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def record_transition(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    event: dict[str, Any],
    expected_status: str | None = None,
    decision: dict[str, Any] | None = None,
) -> None:
    """Update work item status, insert lifecycle event, and optionally a decision atomically."""
    async with get_session_factory()() as session:
        try:
            if expected_status is not None:
                result = await session.execute(
                    text(
                        "UPDATE work_items SET status = :status, department_id = :dept, "
                        "updated_at = :updated_at "
                        "WHERE work_item_id = :id AND status = :expected_status"
                    ),
                    {
                        "status": status,
                        "dept": department_id,
                        "updated_at": updated_at,
                        "id": work_item_id,
                        "expected_status": expected_status,
                    },
                )
            else:
                result = await session.execute(
                    text(
                        "UPDATE work_items SET status = :status, department_id = :dept, "
                        "updated_at = :updated_at WHERE work_item_id = :id"
                    ),
                    {
                        "status": status,
                        "dept": department_id,
                        "updated_at": updated_at,
                        "id": work_item_id,
                    },
                )
            if result.rowcount != 1:
                exists = await session.execute(
                    text("SELECT status FROM work_items WHERE work_item_id = :id"),
                    {"id": work_item_id},
                )
                row = exists.mappings().one_or_none()
                if row is None:
                    raise ValueError(f"Work item {work_item_id} not found")
                raise ValueError(
                    f"Work item {work_item_id} status changed concurrently "
                    f"(expected '{expected_status}', found '{row['status']}')"
                )
            await _insert_lifecycle_event_in_session(session, event)
            if decision:
                from .repository import _insert_decision_within_session
                if decision.get("decision_type") in {"handoff", "review"}:
                    duplicate = await session.execute(
                        text(
                            "SELECT 1 FROM decisions "
                            "WHERE work_item_id = :id AND decision_type IN ('handoff', 'review') "
                            "AND evidence = :evidence LIMIT 1"
                        ),
                        {
                            "id": work_item_id,
                            "evidence": json.dumps(decision.get("evidence", [])),
                        },
                    )
                    if duplicate.first() is not None:
                        raise ValueError("product-definition decision already recorded")
                await _insert_decision_within_session(session, decision)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def record_transition_with_workspace(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    event: dict[str, Any],
    *,
    expected_status: str,
    decision: dict[str, Any],
    workspace_action: Callable[[], None],
) -> None:
    """Persist a transition and workspace mutation under one DB transaction.

    The database CAS and audit rows are written before ``workspace_action`` runs.
    If the workspace write fails, the open transaction rolls back both the CAS
    and its audit rows. This coordinates workers through the database row lock;
    it cannot make a filesystem and database commit globally atomic after a
    process crash.
    """
    async with get_session_factory()() as session:
        try:
            result = await session.execute(
                text(
                    "UPDATE work_items SET status = :status, department_id = :dept, "
                    "updated_at = :updated_at "
                    "WHERE work_item_id = :id AND status = :expected_status"
                ),
                {
                    "status": status,
                    "dept": department_id,
                    "updated_at": updated_at,
                    "id": work_item_id,
                    "expected_status": expected_status,
                },
            )
            if result.rowcount != 1:
                exists = await session.execute(
                    text("SELECT status FROM work_items WHERE work_item_id = :id"),
                    {"id": work_item_id},
                )
                row = exists.mappings().one_or_none()
                if row is None:
                    raise ValueError(f"Work item {work_item_id} not found")
                raise ValueError(
                    f"Work item {work_item_id} status changed concurrently "
                    f"(expected '{expected_status}', found '{row['status']}')"
                )

            await _insert_lifecycle_event_in_session(session, event)
            from .repository import _insert_decision_within_session

            await _insert_decision_within_session(session, decision)
            workspace_action()
            await session.commit()
        except Exception:
            await session.rollback()
            raise
