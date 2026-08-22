"""Interrupt service for HITL approvals."""

import json
import logging
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.infrastructure.events.stream_bus import _bus

from ..config import STORAGE_DIR

logger = logging.getLogger(__name__)


class InterruptDeliveryError(Exception):
    """Raised when interrupt event delivery fails."""


class InterruptService:
    _instance: "InterruptService | None" = None

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # Connection is initialized lazily via _conn() to allow test patching
        self._conn_obj: sqlite3.Connection | None = None
        self._init_table()

    @classmethod
    def instance(cls) -> "InterruptService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _conn(self) -> sqlite3.Connection:
        if self._conn_obj is None:
            db_path = Path(STORAGE_DIR) / "threads.sqlite"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self._conn_obj = sqlite3.connect(str(db_path), check_same_thread=False)
            self._conn_obj.execute("PRAGMA journal_mode=WAL")
            self._conn_obj.row_factory = sqlite3.Row
        return self._conn_obj

    def _init_table(self) -> None:
        try:
            self._conn().execute(
                "CREATE TABLE IF NOT EXISTS interrupts (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, tool_name TEXT NOT NULL DEFAULT 'unknown', tool_input TEXT DEFAULT '{}', message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decision TEXT, reason TEXT, reasoning TEXT, decided_by TEXT, decided_at TEXT, confidence TEXT, alternatives TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
            )
            self._conn().commit()
        except Exception:
            self._conn().rollback()
            raise
        cols = [row[1] for row in self._conn().execute("PRAGMA table_info(interrupts)").fetchall()]
        if "reasoning" not in cols:
            self._conn().execute("ALTER TABLE interrupts ADD COLUMN reasoning TEXT")
            self._conn().commit()

    def create_interrupt(
        self,
        thread_id: str,
        tool_name: str,
        message: str,
        tool_input: dict[str, Any] | None = None,
        decided_by: str = "agent",
        confidence: str = "low",
        alternatives: list[str] | None = None,
        reasoning: str | None = None,
    ) -> dict[str, Any]:
        interrupt_id = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        reasoning_value = reasoning or message
        with self._lock:
            conn = self._conn()
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT INTO interrupts (id, thread_id, tool_name, tool_input, message, status, decision, reason, reasoning, decided_by, decided_at, confidence, alternatives, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, NULL, ?, ?, ?, ?)",
                    (interrupt_id, thread_id, tool_name, json.dumps(tool_input or {}), message, reasoning_value, decided_by, confidence, json.dumps(alternatives or []), now, now),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            interrupt = self.get_interrupt(interrupt_id)
        if interrupt is not None:
            self._publish_event("interrupt.created", {"interrupt": interrupt, "thread_id": thread_id})
        return interrupt  # type: ignore[return-value]

    def list_pending(self) -> list[dict[str, Any]]:
        rows = (
            self._conn()
            .execute("SELECT * FROM interrupts WHERE status = 'pending' ORDER BY created_at DESC")
            .fetchall()
        )
        return [self._row_dict(row) for row in rows]

    def list_all(self) -> list[dict[str, Any]]:
        """Return all interrupts (audit trail), newest first."""
        rows = self._conn().execute("SELECT * FROM interrupts ORDER BY created_at DESC").fetchall()
        return [self._row_dict(row) for row in rows]

    def get_interrupt(self, interrupt_id: str) -> dict[str, Any] | None:
        row = self._conn().execute("SELECT * FROM interrupts WHERE id = ?", (interrupt_id,)).fetchone()
        return self._row_dict(row) if row else None

    def approve_interrupt(self, interrupt_id: str, decision: str, reason: str = "", reasoning: str | None = None) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        reasoning_value = reasoning or reason or None
        with self._lock:
            conn = self._conn()
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    "UPDATE interrupts SET status = 'approved', decision = ?, reason = ?, reasoning = COALESCE(?, reasoning), decided_by = 'user', decided_at = ?, confidence = 'high', updated_at = ? WHERE id = ? AND status = 'pending'",
                    (decision, reason, reasoning_value, now, now, interrupt_id),
                )
                if cur.rowcount == 0:
                    conn.rollback()
                    return None
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        interrupt = self.get_interrupt(interrupt_id)
        if interrupt is not None:
            self._publish_event("interrupt.approved", {"interrupt": interrupt, "thread_id": interrupt["thread_id"]})
        return interrupt

    def reject_interrupt(self, interrupt_id: str, reason: str, reasoning: str | None = None) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        reasoning_value = reasoning or reason or None
        with self._lock:
            conn = self._conn()
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    "UPDATE interrupts SET status = 'rejected', decision = 'rejected', reason = ?, reasoning = COALESCE(?, reasoning), decided_by = 'user', decided_at = ?, confidence = 'high', updated_at = ? WHERE id = ? AND status = 'pending'",
                    (reason, reasoning_value, now, now, interrupt_id),
                )
                if cur.rowcount == 0:
                    conn.rollback()
                    return None
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        interrupt = self.get_interrupt(interrupt_id)
        if interrupt is not None:
            self._publish_event("interrupt.rejected", {"interrupt": interrupt, "thread_id": interrupt["thread_id"]})
        return interrupt

    def _publish_event(self, event_type: str, payload: dict[str, Any]) -> None:
        try:
            _bus.publish(event_type, payload)
        except Exception as exc:
            logger.exception("Failed to deliver %s event", event_type)
            raise InterruptDeliveryError(f"Failed to deliver {event_type} event: {exc}") from exc

    def _row_dict(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        data = dict(row)
        data["tool_input"] = (
            json.loads(data["tool_input"]) if isinstance(data.get("tool_input"), str) else data.get("tool_input", {})
        )
        data["alternatives"] = (
            json.loads(data["alternatives"]) if isinstance(data.get("alternatives"), str) else data.get("alternatives", [])
        )
        return data
