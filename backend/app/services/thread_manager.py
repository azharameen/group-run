"""Thread Manager — wraps LangGraph PostgreSQL checkpointer for persistent thread lifecycle.

Manages the AsyncPostgresSaver singleton that backs LangGraph graph execution,
plus all thread metadata CRUD. Both use the same PostgreSQL connection pool
managed by :mod:`app.db.session`.

Provider swapping
-----------------
Replacing Supabase with another Postgres-compatible provider (AWS RDS, Neon,
etc.) requires only changing DATABASE_URL in the environment. No code changes.
"""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text

from ..config import settings
from ..db.session import get_session_factory

_logger = logging.getLogger(__name__)

# ── Checkpointer singleton ─────────────────────────────────────────────────

_PG_CHECKPOINTER = None
_PG_CHECKPOINTER_CM = None
_CHECKPOINTER_LOCK = asyncio.Lock()


async def get_pg_checkpointer():
    """Return the shared AsyncPostgresSaver singleton, initializing once.

    Calls ``setup()`` on first creation to ensure LangGraph's internal
    checkpoint tables (checkpoints, checkpoint_writes, etc.) exist.
    Must be called from an async context.
    """
    global _PG_CHECKPOINTER, _PG_CHECKPOINTER_CM
    if _PG_CHECKPOINTER is None:
        async with _CHECKPOINTER_LOCK:
            if _PG_CHECKPOINTER is None:
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

                db_url = settings.database_url
                pg_url = (
                    db_url.replace("postgresql+asyncpg://", "postgresql://")
                    .replace("postgresql+psycopg://", "postgresql://")
                )

                try:
                    cm = AsyncPostgresSaver.from_conn_string(pg_url)
                    cp = await cm.__aenter__()
                    await cp.setup()
                    _PG_CHECKPOINTER_CM = cm
                    _PG_CHECKPOINTER = cp
                    _logger.info("[ThreadManager] AsyncPostgresSaver initialized")
                except Exception:
                    _PG_CHECKPOINTER = None
                    _PG_CHECKPOINTER_CM = None
                    raise
    return _PG_CHECKPOINTER


async def close_pg_checkpointer() -> None:
    """Close active checkpointer connections cleanly."""
    global _PG_CHECKPOINTER, _PG_CHECKPOINTER_CM
    if _PG_CHECKPOINTER_CM is not None:
        try:
            await _PG_CHECKPOINTER_CM.__aexit__(None, None, None)
        except Exception as err:  # noqa: BLE001
            _logger.warning("Error closing checkpointer connection: %s", err)
        finally:
            _PG_CHECKPOINTER = None
            _PG_CHECKPOINTER_CM = None


def reset_pg_checkpointer() -> None:
    """Reset the checkpointer singleton reference."""
    global _PG_CHECKPOINTER, _PG_CHECKPOINTER_CM
    _PG_CHECKPOINTER = None
    _PG_CHECKPOINTER_CM = None


# ── Thread Metadata CRUD ──────────────────────────────────────────────────


async def create_thread(
    title: str = "New Chat",
    idea_id: str | None = None,
    tags: list[str] | None = None,
    agent_names: list[str] | None = None,
) -> dict[str, Any]:
    """Create a new thread and return its metadata."""
    thread_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    async with get_session_factory()() as session:
        await session.execute(
            text(
                "INSERT INTO thread_metadata "
                "(thread_id, title, created_at, updated_at, status, idea_id, tags, agent_names) "
                "VALUES (:thread_id, :title, :created_at, :updated_at, 'active', "
                ":idea_id, :tags, :agent_names)"
            ),
            {
                "thread_id": thread_id,
                "title": title,
                "created_at": now,
                "updated_at": now,
                "idea_id": idea_id,
                "tags": json.dumps(tags or []),
                "agent_names": json.dumps(agent_names or []),
            },
        )
        await session.commit()
    return await get_thread(thread_id)  # type: ignore[return-value]


async def list_threads(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List threads sorted by updated_at DESC, optionally filtered by status."""
    async with get_session_factory()() as session:
        if status:
            result = await session.execute(
                text(
                    "SELECT * FROM thread_metadata WHERE status = :status "
                    "ORDER BY updated_at DESC LIMIT :limit OFFSET :offset"
                ),
                {"status": status, "limit": limit, "offset": offset},
            )
        else:
            result = await session.execute(
                text(
                    "SELECT * FROM thread_metadata "
                    "ORDER BY updated_at DESC LIMIT :limit OFFSET :offset"
                ),
                {"limit": limit, "offset": offset},
            )
        rows = result.mappings().all()
    return [_row_dict(dict(row)) for row in rows]


async def get_thread(thread_id: str) -> dict[str, Any] | None:
    """Return thread metadata by ID, or None."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text("SELECT * FROM thread_metadata WHERE thread_id = :tid"),
            {"tid": thread_id},
        )
        row = result.mappings().one_or_none()
    return _row_dict(dict(row)) if row else None


async def update_thread(thread_id: str, **fields: Any) -> dict[str, Any] | None:
    """Update thread metadata fields. If 'updated_at' not provided, auto-set to now."""
    allowed = {"title", "status", "idea_id", "tags", "agent_names", "updated_at"}
    to_set = {k: v for k, v in fields.items() if k in allowed}
    if not to_set:
        return await get_thread(thread_id)
    to_set.setdefault("updated_at", datetime.now(UTC).isoformat())
    for list_field in ("tags", "agent_names"):
        if list_field in to_set and isinstance(to_set[list_field], list):
            to_set[list_field] = json.dumps(to_set[list_field])
    set_clause = ", ".join(f"{k} = :{k}" for k in to_set)
    to_set["thread_id"] = thread_id
    async with get_session_factory()() as session:
        await session.execute(
            text(f"UPDATE thread_metadata SET {set_clause} WHERE thread_id = :thread_id"),
            to_set,
        )
        await session.commit()
    return await get_thread(thread_id)


async def delete_thread(thread_id: str) -> bool:
    """Delete thread metadata. Returns True if existed."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text("DELETE FROM thread_metadata WHERE thread_id = :tid"),
            {"tid": thread_id},
        )
        await session.commit()
        return result.rowcount > 0


async def touch_thread(thread_id: str) -> None:
    """Update the updated_at timestamp (e.g. after a new message)."""
    async with get_session_factory()() as session:
        await session.execute(
            text(
                "UPDATE thread_metadata SET updated_at = :now WHERE thread_id = :tid"
            ),
            {"now": datetime.now(UTC).isoformat(), "tid": thread_id},
        )
        await session.commit()


async def get_thread_messages(thread_id: str) -> list[dict[str, Any]]:
    """Retrieve messages from a thread's latest checkpoint."""
    try:
        checkpointer = await get_pg_checkpointer()
        checkpoint = await checkpointer.aget({"configurable": {"thread_id": thread_id}})
        if checkpoint is None:
            return []
        messages = checkpoint.get("channel_values", {}).get("messages", [])
        if hasattr(messages, "wrapped"):
            messages = messages.wrapped
        result = []
        if isinstance(messages, list):
            for msg in messages:
                if hasattr(msg, "wrapped"):
                    msg = msg.wrapped
                if hasattr(msg, "type"):
                    result.append(
                        {
                            "id": getattr(msg, "id", ""),
                            "type": msg.type,
                            "content": msg.content,
                            "role": getattr(msg, "role", ""),
                            "name": getattr(msg, "name", ""),
                            "timestamp": getattr(msg, "timestamp", ""),
                            "additional_kwargs": getattr(msg, "additional_kwargs", {}),
                        }
                    )
                elif isinstance(msg, dict):
                    result.append(msg)
        return result
    except Exception:
        _logger.exception("Failed to get messages for thread %s", thread_id)
        return []


# ── Helpers ───────────────────────────────────────────────────────────────


def _row_dict(row: dict[str, Any]) -> dict[str, Any]:
    """Deserialize JSON list fields in a thread_metadata row."""
    d = dict(row)
    for list_field in ("tags", "agent_names"):
        if list_field in d and isinstance(d[list_field], str):
            try:
                d[list_field] = json.loads(d[list_field])
            except (json.JSONDecodeError, TypeError):
                d[list_field] = []
    return d
