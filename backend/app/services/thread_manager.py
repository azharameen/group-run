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
from ..db.url import normalize_postgres_dsn

_logger = logging.getLogger(__name__)

# ── Checkpointer singleton ─────────────────────────────────────────────────

_PG_CHECKPOINTER = None
_PG_CHECKPOINTER_CM = None
_PG_CHECKPOINTER_LOOP: asyncio.AbstractEventLoop | None = None
_CHECKPOINTER_LOCK = asyncio.Lock()


async def get_pg_checkpointer():
    """Return the shared AsyncPostgresSaver singleton, initializing once.

    Calls ``setup()`` on first creation to ensure LangGraph's internal
    checkpoint tables (checkpoints, checkpoint_writes, etc.) exist.
    Must be called from an async context.
    """
    global _PG_CHECKPOINTER, _PG_CHECKPOINTER_CM, _PG_CHECKPOINTER_LOOP
    cm = None
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _PG_CHECKPOINTER is not None and current_loop is not None and _PG_CHECKPOINTER_LOOP is not current_loop:
        _PG_CHECKPOINTER = None
        _PG_CHECKPOINTER_CM = None
        _PG_CHECKPOINTER_LOOP = None

    if _PG_CHECKPOINTER is None:
        async with _CHECKPOINTER_LOCK:
            if _PG_CHECKPOINTER is None:
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
                from psycopg import AsyncConnection
                from psycopg.rows import dict_row

                pg_url = normalize_postgres_dsn(settings.database_url)

                try:
                    # Disable psycopg named prepared statements because the
                    # Supabase transaction pooler reuses connections across
                    # transactions and can otherwise reuse statement names.
                    cm = await AsyncConnection.connect(
                        pg_url,
                        autocommit=True,
                        prepare_threshold=None,
                        row_factory=dict_row,
                        connect_timeout=10,
                    )
                    cp = AsyncPostgresSaver(cm)
                    await cp.setup()
                    _PG_CHECKPOINTER_CM = cm
                    _PG_CHECKPOINTER = cp
                    _PG_CHECKPOINTER_LOOP = current_loop
                    _logger.info("[ThreadManager] AsyncPostgresSaver initialized")
                except asyncio.CancelledError:
                    if cm is not None:
                        await asyncio.shield(cm.close())
                    _PG_CHECKPOINTER = None
                    _PG_CHECKPOINTER_CM = None
                    _PG_CHECKPOINTER_LOOP = None
                    raise
                except Exception:
                    if cm is not None:
                        await cm.close()
                    _PG_CHECKPOINTER = None
                    _PG_CHECKPOINTER_CM = None
                    _PG_CHECKPOINTER_LOOP = None
                    raise
    return _PG_CHECKPOINTER


async def close_pg_checkpointer() -> None:
    """Close active checkpointer connections cleanly."""
    global _PG_CHECKPOINTER, _PG_CHECKPOINTER_CM, _PG_CHECKPOINTER_LOOP
    if _PG_CHECKPOINTER_CM is not None:
        try:
            await _PG_CHECKPOINTER_CM.__aexit__(None, None, None)
        except Exception as err:  # noqa: BLE001
            _logger.warning("Error closing checkpointer connection: %s", err)
        finally:
            _PG_CHECKPOINTER = None
            _PG_CHECKPOINTER_CM = None
            _PG_CHECKPOINTER_LOOP = None


def reset_pg_checkpointer() -> None:
    """Reset the checkpointer singleton reference."""
    global _PG_CHECKPOINTER, _PG_CHECKPOINTER_CM, _PG_CHECKPOINTER_LOOP
    _PG_CHECKPOINTER = None
    _PG_CHECKPOINTER_CM = None
    _PG_CHECKPOINTER_LOOP = None


# ── Thread Metadata CRUD ──────────────────────────────────────────────────


async def create_thread(
    title: str = "New Chat",
    idea_id: str | None = None,
    tags: list[str] | None = None,
    agent_names: list[str] | None = None,
    owner_uid: str | None = None,
) -> dict[str, Any]:
    """Create a new thread and return its metadata."""
    thread_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    async with get_session_factory()() as session:
        await session.execute(
            text(
                "INSERT INTO thread_metadata "
                "(thread_id, title, created_at, updated_at, status, idea_id, tags, agent_names, owner_uid) "
                "VALUES (:thread_id, :title, :created_at, :updated_at, 'active', "
                ":idea_id, :tags, :agent_names, :owner_uid)"
            ),
            {
                "thread_id": thread_id,
                "title": title,
                "created_at": now,
                "updated_at": now,
                "idea_id": idea_id,
                "tags": json.dumps(tags or []),
                "agent_names": json.dumps(agent_names or []),
                "owner_uid": owner_uid,
            },
        )
        await session.commit()
    return await get_thread(thread_id, owner_uid)  # type: ignore[return-value]


async def list_threads(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    owner_uid: str | None = None,
) -> list[dict[str, Any]]:
    """List threads sorted by updated_at DESC, optionally filtered by status."""
    async with get_session_factory()() as session:
        filters = ["status = :status"] if status else []
        if owner_uid is not None:
            filters.append("owner_uid = :owner_uid")
        where_clause = f" WHERE {' AND '.join(filters)}" if filters else ""
        params = {"status": status, "limit": limit, "offset": offset, "owner_uid": owner_uid}
        if status:
            result = await session.execute(
                text(
                    f"SELECT * FROM thread_metadata{where_clause} "
                    "ORDER BY updated_at DESC LIMIT :limit OFFSET :offset"
                ),
                params,
            )
        else:
            result = await session.execute(
                text(
                    f"SELECT * FROM thread_metadata{where_clause} "
                    "ORDER BY updated_at DESC LIMIT :limit OFFSET :offset"
                ),
                params,
            )
        rows = result.mappings().all()
    return [_row_dict(dict(row)) for row in rows]


async def get_thread(thread_id: str, owner_uid: str | None = None) -> dict[str, Any] | None:
    """Return thread metadata by ID, or None.

    Branches on ``owner_uid`` in Python instead of comparing a possibly-NULL
    bind parameter in SQL: asyncpg cannot infer the type of a NULL parameter
    used in a ``IS NULL`` predicate.
    """
    if owner_uid is None:
        stmt = "SELECT * FROM thread_metadata WHERE thread_id = :tid"
        params: dict[str, Any] = {"tid": thread_id}
    else:
        stmt = "SELECT * FROM thread_metadata WHERE thread_id = :tid AND owner_uid = :owner_uid"
        params = {"tid": thread_id, "owner_uid": owner_uid}
    async with get_session_factory()() as session:
        result = await session.execute(text(stmt), params)
        row = result.mappings().one_or_none()
    return _row_dict(dict(row)) if row else None


async def claim_legacy_thread(thread_id: str, owner_uid: str) -> dict[str, Any] | None:
    """Atomically assign an unowned legacy thread to its first authenticated user.

    Legacy threads are deliberately omitted from listings. A client that retained
    its opaque thread ID can claim it once; concurrent claims return only the
    eventual owner's row and never disclose another user's metadata.
    """
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                """
                UPDATE thread_metadata
                SET owner_uid = :owner_uid
                WHERE thread_id = :thread_id AND owner_uid IS NULL
                RETURNING *
                """
            ),
            {"thread_id": thread_id, "owner_uid": owner_uid},
        )
        row = result.mappings().one_or_none()
        await session.commit()
    if row:
        return _row_dict(dict(row))
    return await get_thread(thread_id, owner_uid)


async def get_or_claim_thread(thread_id: str, owner_uid: str) -> dict[str, Any] | None:
    """Return an owned thread, atomically claiming a legacy unowned row if needed."""
    owned = await get_thread(thread_id, owner_uid)
    return owned if owned else await claim_legacy_thread(thread_id, owner_uid)


def _owner_clause(owner_uid: str | None) -> tuple[str, dict[str, Any]]:
    """Owner-scoped WHERE fragment for thread_metadata queries.

    Branches in Python instead of using a ``(:owner_uid IS NULL OR ...)`` SQL
    predicate: asyncpg cannot determine the type of a parameter appearing in
    an ``IS NULL`` comparison and fails to prepare the statement.
    """
    if owner_uid is None:
        return "", {}
    return "AND owner_uid = :owner_uid", {"owner_uid": owner_uid}


async def update_thread(
    thread_id: str, owner_uid: str | None = None, **fields: Any
) -> dict[str, Any] | None:
    """Update thread metadata fields. If 'updated_at' not provided, auto-set to now."""
    allowed = {
        "title", "status", "idea_id", "tags", "agent_names", "provider_id", "model_id", "updated_at"
    }
    to_set = {k: v for k, v in fields.items() if k in allowed}
    if not to_set:
        return await get_thread(thread_id, owner_uid)
    to_set.setdefault("updated_at", datetime.now(UTC).isoformat())
    for list_field in ("tags", "agent_names"):
        if list_field in to_set and isinstance(to_set[list_field], list):
            to_set[list_field] = json.dumps(to_set[list_field])
    set_clause = ", ".join(f"{k} = :{k}" for k in to_set)
    to_set["thread_id"] = thread_id
    owner_clause, owner_params = _owner_clause(owner_uid)
    async with get_session_factory()() as session:
        await session.execute(
            text(
                f"UPDATE thread_metadata SET {set_clause} WHERE thread_id = :thread_id "
                f"{owner_clause}"
            ),
            {**to_set, **owner_params},
        )
        await session.commit()
    return await get_thread(thread_id, owner_uid)


async def delete_thread(thread_id: str, owner_uid: str | None = None) -> bool:
    """Delete thread metadata. Returns True if existed."""
    owner_clause, owner_params = _owner_clause(owner_uid)
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                f"DELETE FROM thread_metadata WHERE thread_id = :tid {owner_clause}"
            ),
            {"tid": thread_id, **owner_params},
        )
        await session.commit()
        return result.rowcount > 0


async def touch_thread(thread_id: str, owner_uid: str | None = None) -> None:
    """Update the updated_at timestamp (e.g. after a new message)."""
    owner_clause, owner_params = _owner_clause(owner_uid)
    async with get_session_factory()() as session:
        await session.execute(
            text(
                f"UPDATE thread_metadata SET updated_at = :now WHERE thread_id = :tid {owner_clause}"
            ),
            {"now": datetime.now(UTC).isoformat(), "tid": thread_id, **owner_params},
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
