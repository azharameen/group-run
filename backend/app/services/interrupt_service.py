"""Interrupt service for HITL approvals.

Fully async PostgreSQL implementation using the shared SQLAlchemy connection pool.
"""

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text

from app.infrastructure.events.stream_bus import _bus

from ..db.session import get_session_factory

logger = logging.getLogger(__name__)


class InterruptDeliveryError(Exception):
    """Raised when interrupt event delivery fails."""


class InterruptService:
    _instance: "InterruptService | None" = None

    def __init__(self) -> None:
        pass  # All state lives in PostgreSQL; no instance-level connection needed.

    @classmethod
    def instance(cls) -> "InterruptService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def create_interrupt(
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

        async with get_session_factory()() as session:
            try:
                await session.execute(
                    text(
                        """
                        INSERT INTO interrupts
                        (id, thread_id, tool_name, tool_input, message, status,
                         decision, reason, reasoning, decided_by, decided_at,
                         confidence, alternatives, created_at, updated_at)
                        VALUES
                        (:id, :thread_id, :tool_name, :tool_input, :message, 'pending',
                         NULL, NULL, :reasoning, :decided_by, NULL,
                         :confidence, :alternatives, :created_at, :updated_at)
                        """
                    ),
                    {
                        "id": interrupt_id,
                        "thread_id": thread_id,
                        "tool_name": tool_name,
                        "tool_input": json.dumps(tool_input or {}),
                        "message": message,
                        "reasoning": reasoning_value,
                        "decided_by": decided_by,
                        "confidence": confidence,
                        "alternatives": json.dumps(alternatives or []),
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                await session.commit()
                await session.commit()
            except Exception:
                await session.rollback()
                raise

        interrupt = await self.get_interrupt(interrupt_id)
        if interrupt is not None:
            self._publish_event(
                "interrupt.created", {"interrupt": interrupt, "thread_id": thread_id}
            )
        return interrupt  # type: ignore[return-value]

    async def list_pending(self) -> list[dict[str, Any]]:
        async with get_session_factory()() as session:
            from sqlalchemy import text
            result = await session.execute(
                text("SELECT * FROM interrupts WHERE status = 'pending' ORDER BY created_at DESC")
            )
            return [self._row_dict(dict(r)) for r in result.mappings()]

    async def list_pending_for_owner(self, owner_uid: str) -> list[dict[str, Any]]:
        """List only pending interrupts whose thread belongs to this user."""
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    """
                    SELECT i.* FROM interrupts i
                    JOIN thread_metadata t ON t.thread_id = i.thread_id
                    WHERE i.status = 'pending' AND t.owner_uid = :owner_uid
                    ORDER BY i.created_at DESC
                    """
                ),
                {"owner_uid": owner_uid},
            )
            return [self._row_dict(dict(r)) for r in result.mappings()]

    async def list_all(self) -> list[dict[str, Any]]:
        """Return all interrupts (audit trail), newest first."""
        async with get_session_factory()() as session:
            from sqlalchemy import text
            result = await session.execute(
                text("SELECT * FROM interrupts ORDER BY created_at DESC")
            )
            return [self._row_dict(dict(r)) for r in result.mappings()]

    async def get_interrupt(self, interrupt_id: str) -> dict[str, Any] | None:
        async with get_session_factory()() as session:
            from sqlalchemy import text
            result = await session.execute(
                text("SELECT * FROM interrupts WHERE id = :id"), {"id": interrupt_id}
            )
            row = result.mappings().one_or_none()
        return self._row_dict(dict(row)) if row else None

    async def approve_interrupt(
        self,
        interrupt_id: str,
        decision: str,
        reason: str = "",
        reasoning: str | None = None,
    ) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        reasoning_value = reasoning or reason or None

        async with get_session_factory()() as session:
            from sqlalchemy import text
            try:
                result = await session.execute(
                    text(
                        "UPDATE interrupts SET status = 'approved', decision = :decision, "
                        "reason = :reason, reasoning = COALESCE(:reasoning, reasoning), "
                        "decided_by = 'user', decided_at = :now, confidence = 'high', "
                        "updated_at = :now WHERE id = :id AND status = 'pending'"
                    ),
                    {
                        "decision": decision,
                        "reason": reason,
                        "reasoning": reasoning_value,
                        "now": now,
                        "id": interrupt_id,
                    },
                )
                if result.rowcount == 0:
                    await session.rollback()
                    return None
                await session.commit()
            except Exception:
                await session.rollback()
                raise

        interrupt = await self.get_interrupt(interrupt_id)
        if interrupt is not None:
            self._publish_event(
                "interrupt.approved",
                {"interrupt": interrupt, "thread_id": interrupt["thread_id"]},
            )
        return interrupt

    async def reject_interrupt(
        self,
        interrupt_id: str,
        reason: str,
        reasoning: str | None = None,
    ) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        reasoning_value = reasoning or reason or None

        async with get_session_factory()() as session:
            from sqlalchemy import text
            try:
                result = await session.execute(
                    text(
                        "UPDATE interrupts SET status = 'rejected', decision = 'rejected', "
                        "reason = :reason, reasoning = COALESCE(:reasoning, reasoning), "
                        "decided_by = 'user', decided_at = :now, confidence = 'high', "
                        "updated_at = :now WHERE id = :id AND status = 'pending'"
                    ),
                    {
                        "reason": reason,
                        "reasoning": reasoning_value,
                        "now": now,
                        "id": interrupt_id,
                    },
                )
                if result.rowcount == 0:
                    await session.rollback()
                    return None
                await session.commit()
            except Exception:
                await session.rollback()
                raise

        interrupt = await self.get_interrupt(interrupt_id)
        if interrupt is not None:
            self._publish_event(
                "interrupt.rejected",
                {"interrupt": interrupt, "thread_id": interrupt["thread_id"]},
            )
        return interrupt

    def _publish_event(self, event_type: str, payload: dict[str, Any]) -> None:
        try:
            _bus.publish(event_type, payload)
        except Exception as exc:
            logger.exception("Failed to deliver %s event", event_type)
            raise InterruptDeliveryError(f"Failed to deliver {event_type} event: {exc}") from exc

    def _row_dict(self, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        data = dict(row)
        tool_in = data.get("tool_input")
        if isinstance(tool_in, str):
            try:
                data["tool_input"] = json.loads(tool_in)
            except (json.JSONDecodeError, TypeError):
                data["tool_input"] = {}
        else:
            data["tool_input"] = tool_in if tool_in is not None else {}

        alts = data.get("alternatives")
        if isinstance(alts, str):
            try:
                data["alternatives"] = json.loads(alts)
            except (json.JSONDecodeError, TypeError):
                data["alternatives"] = []
        else:
            data["alternatives"] = alts if alts is not None else []

        return data
