"""Thread Manager — wraps LangGraph checkpointer for persistent thread lifecycle."""

import json
import logging
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiosqlite
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from ..config import STORAGE_DIR

_logger = logging.getLogger(__name__)

# ── Shared SQLite connection (checkpointer DB) ─────────────────────────────

_THREAD_DB_PATH: Path | None = None
_SQLITE_SAVER: SqliteSaver | None = None
_ASYNC_SQLITE_SAVER: AsyncSqliteSaver | None = None
_METADATA_CONN: sqlite3.Connection | None = None


def _get_db_path() -> Path:
    global _THREAD_DB_PATH
    if _THREAD_DB_PATH is None:
        _THREAD_DB_PATH = Path(STORAGE_DIR) / "threads.sqlite"
        _THREAD_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return _THREAD_DB_PATH


def _is_connection_alive(conn: sqlite3.Connection | None) -> bool:
    """Check whether a sync sqlite3 connection is still usable."""
    if conn is None:
        return False
    try:
        conn.execute("SELECT 1")
        return True
    except Exception:  # noqa: BLE001  # liveness probe: any error means the connection is dead
        return False


def _is_async_saver_alive(saver: AsyncSqliteSaver | None) -> bool:
    """Check whether an AsyncSqliteSaver's aiosqlite connection is still usable.

    A connection becomes unusable when it was closed (``_connection`` is reset
    to ``None``) or when its worker thread died (e.g. the event loop it was
    reporting results to got closed).  A dead thread cannot be restarted
    (``Thread.start()`` raises), so a saver in that state must be discarded
    and replaced instead of being reused.
    """
    if saver is None:
        return False
    conn = getattr(saver, "conn", None)
    if conn is None:
        return False
    if getattr(conn, "_connection", None) is None:
        return False
    thread = getattr(conn, "_thread", None)
    return thread is None or thread.is_alive()


def _discard_async_saver(saver: AsyncSqliteSaver | None) -> None:
    """Best-effort teardown of an unusable AsyncSqliteSaver before replacement."""
    if saver is None:
        return
    conn = getattr(saver, "conn", None)
    if conn is None:
        return
    thread = getattr(conn, "_thread", None)
    # Only attempt a stop when the worker thread is still running (the
    # connection was started but never properly closed).  Already-closed or
    # never-started connections have nothing to reap.
    if thread is not None and thread.is_alive():
        try:
            conn.stop()
        except Exception:  # best-effort stop; the saver is discarded anyway
            _logger.debug("Failed to stop aiosqlite connection during saver teardown", exc_info=True)


def get_checkpointer() -> SqliteSaver:
    """Return a singleton SqliteSaver backed by threads.sqlite."""
    global _SQLITE_SAVER, _METADATA_CONN
    # Reconnect if the existing connection was closed (e.g. by lifespan shutdown)
    if _SQLITE_SAVER is not None and not _is_connection_alive(_SQLITE_SAVER.conn):
        try:
            _SQLITE_SAVER.conn.close()
        except Exception:  # best-effort close of a dead connection
            _logger.debug("Failed to close stale sync checkpointer connection", exc_info=True)
        _SQLITE_SAVER = None
        _METADATA_CONN = None
    if _SQLITE_SAVER is None:
        db_path = _get_db_path()
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row
        _METADATA_CONN = conn
        _SQLITE_SAVER = SqliteSaver(conn)
        _init_metadata_table(conn)
    return _SQLITE_SAVER


async def create_async_checkpointer() -> AsyncSqliteSaver:
    """Create and return the async checkpointer singleton within an async context.

    Must be called from an async context to avoid aiosqlite's
    ``DeprecationWarning: There is no current event loop`` when the
    connection is created before the event loop is available.

    The returned saver has already been set up (``setup()`` called) and
    WAL mode enabled. Callers can use it directly.
    """
    global _ASYNC_SQLITE_SAVER
    if _ASYNC_SQLITE_SAVER is not None and _is_async_saver_alive(_ASYNC_SQLITE_SAVER):
        return _ASYNC_SQLITE_SAVER
    _discard_async_saver(_ASYNC_SQLITE_SAVER)
    db_path = _get_db_path()
    conn = aiosqlite.connect(str(db_path))
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    await conn.execute("PRAGMA journal_mode=WAL")
    _ASYNC_SQLITE_SAVER = saver
    return saver


def get_async_checkpointer() -> AsyncSqliteSaver:
    """Return the async checkpointer singleton (sync fallback for graph compilation).

    Prefer ``create_async_checkpointer()`` when called from an async context.
    This sync version is kept for backward compatibility with graph compilation
    calls that happen outside async context.
    """
    global _ASYNC_SQLITE_SAVER
    if _ASYNC_SQLITE_SAVER is None or not _is_async_saver_alive(_ASYNC_SQLITE_SAVER):
        _discard_async_saver(_ASYNC_SQLITE_SAVER)
        db_path = _get_db_path()
        conn = aiosqlite.connect(str(db_path))
        _ASYNC_SQLITE_SAVER = AsyncSqliteSaver(conn)
    return _ASYNC_SQLITE_SAVER


def _reset_async_checkpointer() -> None:
    """Reset the async checkpointer singleton (for test isolation and hot-reload)."""
    global _ASYNC_SQLITE_SAVER
    _ASYNC_SQLITE_SAVER = None


async def _ensure_async_checkpointer_wal() -> None:
    """Enable WAL mode on the async checkpointer connection (must run inside async context)."""
    saver = get_async_checkpointer()
    await saver.conn.execute("PRAGMA journal_mode=WAL")


def _init_metadata_table(conn: sqlite3.Connection) -> None:
    """Ensure the thread_metadata table exists."""
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS thread_metadata (thread_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New Chat', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', idea_id TEXT, tags TEXT DEFAULT '[]', agent_names TEXT DEFAULT '[]')")
        try:
            columns = [row[1] for row in conn.execute("PRAGMA table_info(thread_metadata)").fetchall()]
            if "work_item_id" in columns and "idea_id" not in columns:
                conn.execute("ALTER TABLE thread_metadata RENAME COLUMN work_item_id TO idea_id")
        except sqlite3.OperationalError:
            pass
        conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_metadata_updated ON thread_metadata(updated_at DESC)")
        conn.commit()
    except Exception:
        conn.rollback()
        raise


# ── Thread Metadata CRUD ──────────────────────────────────────────────────


def create_thread(
    title: str = "New Chat",
    idea_id: str | None = None,
    tags: list[str] | None = None,
    agent_names: list[str] | None = None,
) -> dict[str, Any]:
    """Create a new thread and return its metadata."""
    thread_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    conn = get_checkpointer().conn
    try:
        conn.execute(
            "INSERT INTO thread_metadata (thread_id, title, created_at, updated_at, status, idea_id, tags, agent_names) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
            (thread_id, title, now, now, idea_id, json.dumps(tags or []), json.dumps(agent_names or [])),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    row = conn.execute("SELECT * FROM thread_metadata WHERE thread_id = ?", (thread_id,)).fetchone()
    return _row_dict(row) if row else None


def list_threads(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List threads sorted by updated_at DESC, optionally filtered by status."""
    conn = get_checkpointer().conn
    if status:
        rows = conn.execute("SELECT * FROM thread_metadata WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?", (status, limit, offset)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM thread_metadata ORDER BY updated_at DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
    return [_row_dict(r) for r in rows]


def get_thread(thread_id: str) -> dict[str, Any] | None:
    """Return thread metadata by ID, or None."""
    row = get_checkpointer().conn.execute("SELECT * FROM thread_metadata WHERE thread_id = ?", (thread_id,)).fetchone()
    return _row_dict(row) if row else None


def update_thread(
    thread_id: str,
    **fields: Any,
) -> dict[str, Any] | None:
    """Update thread metadata fields. If 'updated_at' not provided, auto-set to now."""
    allowed = {"title", "status", "idea_id", "tags", "agent_names", "updated_at"}
    to_set = {k: v for k, v in fields.items() if k in allowed}
    if not to_set:
        return get_thread(thread_id)
    to_set.setdefault("updated_at", datetime.now(UTC).isoformat())
    for list_field in ("tags", "agent_names"):
        if list_field in to_set and isinstance(to_set[list_field], list):
            to_set[list_field] = json.dumps(to_set[list_field])
    conn = get_checkpointer().conn
    try:
        conn.execute(f"UPDATE thread_metadata SET {', '.join(f'{k} = ?' for k in to_set)} WHERE thread_id = ?", list(to_set.values()) + [thread_id])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return get_thread(thread_id)


def delete_thread(thread_id: str) -> bool:
    """Delete thread metadata. Returns True if existed."""
    conn = get_checkpointer().conn
    try:
        cur = conn.execute("DELETE FROM thread_metadata WHERE thread_id = ?", (thread_id,))
        conn.commit()
        return cur.rowcount > 0
    except Exception:
        conn.rollback()
        raise


async def get_thread_messages(thread_id: str) -> list[dict[str, Any]]:
    """Retrieve messages from a thread's latest checkpoint."""
    try:
        checkpointer = get_async_checkpointer()
        await checkpointer.setup()
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
                    result.append({"id": getattr(msg, "id", ""), "type": msg.type, "content": msg.content, "role": getattr(msg, "role", ""), "name": getattr(msg, "name", ""), "timestamp": getattr(msg, "timestamp", ""), "additional_kwargs": getattr(msg, "additional_kwargs", {})})
                elif isinstance(msg, dict):
                    result.append(msg)
        return result
    except Exception:
        _logger.exception("Failed to get messages for thread %s", thread_id)
        return []


def touch_thread(thread_id: str) -> None:
    """Update the updated_at timestamp (e.g. after a new message)."""
    conn = get_checkpointer().conn
    try:
        conn.execute("UPDATE thread_metadata SET updated_at = ? WHERE thread_id = ?", (datetime.now(UTC).isoformat(), thread_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


# ── Helpers ───────────────────────────────────────────────────────────────



def _row_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    # Deserialize JSON fields
    for list_field in ("tags", "agent_names"):
        if list_field in d and isinstance(d[list_field], str):
            try:
                d[list_field] = json.loads(d[list_field])
            except (json.JSONDecodeError, TypeError):
                d[list_field] = []
    return d
