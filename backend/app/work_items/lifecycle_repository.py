"""Persistence helpers for lifecycle events."""

import json
import sqlite3
from typing import Any

from . import repository


def insert_lifecycle_event(event: dict[str, Any]) -> None:
    conn = repository._get_conn()
    conn.execute(
        "INSERT INTO lifecycle_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        tuple(event[key] if key != "alternatives" else json.dumps(event[key]) for key in (
            "event_id", "work_item_id", "event_type", "from_status", "to_status",
            "from_department", "to_department", "decided_by", "decided_at",
            "confidence", "reasoning", "alternatives",
        )),
    )


def list_lifecycle_events(work_item_id: str) -> list[sqlite3.Row]:
    return repository._get_conn().execute(
        "SELECT * FROM lifecycle_events WHERE work_item_id = ? "
        "ORDER BY decided_at ASC, rowid ASC", (work_item_id,)
    ).fetchall()


def update_work_item_status(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    expected_status: str | None = None,
    commit: bool = True,
) -> None:
    conn = repository._get_conn()
    try:
        if expected_status is not None:
            cursor = conn.execute(
                "UPDATE work_items SET status = ?, department_id = ?, updated_at = ? "
                "WHERE work_item_id = ? AND status = ?",
                (status, department_id, updated_at, work_item_id, expected_status),
            )
        else:
            cursor = conn.execute(
                "UPDATE work_items SET status = ?, department_id = ?, updated_at = ? WHERE work_item_id = ?",
                (status, department_id, updated_at, work_item_id),
            )
        if cursor.rowcount != 1:
            item_exists = conn.execute(
                "SELECT status FROM work_items WHERE work_item_id = ?", (work_item_id,)
            ).fetchone()
            if item_exists is None:
                raise ValueError(f"Work item {work_item_id} not found")
            raise ValueError(
                f"Work item {work_item_id} status changed concurrently (expected '{expected_status}', found '{item_exists['status']}')"
            )
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise


def insert_org_alert(alert: dict[str, Any], commit: bool = True) -> None:
    """Insert one org_alerts row (Story 9.2 escalation alert)."""
    conn = repository._get_conn()
    conn.execute(
        "INSERT INTO org_alerts (alert_id, org_id, work_item_id, phase, reason, raised_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (alert["alert_id"], alert["org_id"], alert["work_item_id"],
         alert["phase"], alert["reason"], alert["raised_at"]),
    )
    if commit:
        conn.commit()


def record_escalation(alert: dict[str, Any], event: dict[str, Any]) -> None:
    """Insert an escalation alert and its audit event atomically.

    Mirrors :func:`record_reassignment`: the alert row and the audit event
    commit together, so an alert never persists without its trail.
    """
    conn = repository._get_conn()
    try:
        insert_org_alert(alert, commit=False)
        insert_lifecycle_event(event)
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def list_org_alerts(org_id: str) -> list[sqlite3.Row]:
    """Return all alerts for one organization, oldest first."""
    return repository._get_conn().execute(
        "SELECT * FROM org_alerts WHERE org_id = ? ORDER BY raised_at ASC, rowid ASC",
        (org_id,),
    ).fetchall()


def has_org_alert(org_id: str, work_item_id: str, phase: str) -> bool:
    """Return whether an alert already exists for (org, item, phase)."""
    row = repository._get_conn().execute(
        "SELECT 1 FROM org_alerts WHERE org_id = ? AND work_item_id = ? AND phase = ?"
        " LIMIT 1",
        (org_id, work_item_id, phase),
    ).fetchone()
    return row is not None


def record_reassignment(
    work_item_id: str,
    owner_agent_id: str,
    updated_at: str,
    event: dict[str, Any],
    previous_owner_agent_id: str | None = None,
) -> None:
    """Update a work item's owner and record the reassignment event atomically.

    Mirrors :func:`record_transition`: the owner update and the audit event
    commit together, so a reassignment never leaves state without its trail.
    When ``previous_owner_agent_id`` is given, the update is guarded on the
    current owner so a concurrent reassignment cannot be overwritten.
    """
    conn = repository._get_conn()
    try:
        if previous_owner_agent_id is not None:
            cursor = conn.execute(
                "UPDATE work_items SET owner_agent_id = ?, updated_at = ?"
                " WHERE work_item_id = ? AND owner_agent_id = ?",
                (owner_agent_id, updated_at, work_item_id, previous_owner_agent_id),
            )
        else:
            cursor = conn.execute(
                "UPDATE work_items SET owner_agent_id = ?, updated_at = ?"
                " WHERE work_item_id = ?",
                (owner_agent_id, updated_at, work_item_id),
            )
        if cursor.rowcount != 1:
            raise ValueError(f"Work item {work_item_id} not found")
        insert_lifecycle_event(event)
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def record_transition(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    event: dict[str, Any],
    expected_status: str | None = None,
) -> None:
    conn = repository._get_conn()
    try:
        update_work_item_status(
            work_item_id,
            status,
            department_id,
            updated_at,
            expected_status=expected_status,
            commit=False,
        )
        insert_lifecycle_event(event)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
