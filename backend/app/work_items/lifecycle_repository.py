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
