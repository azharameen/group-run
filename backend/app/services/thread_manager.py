"""Thread Manager — wraps LangGraph checkpointer for persistent thread lifecycle."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import aiosqlite

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from ..config import STORAGE_DIR


# ── Shared SQLite connection (checkpointer DB) ─────────────────────────────

_THREAD_DB_PATH: Optional[Path] = None
_SQLITE_SAVER: Optional[SqliteSaver] = None
_ASYNC_SQLITE_SAVER: Optional[AsyncSqliteSaver] = None
_METADATA_CONN: Optional[sqlite3.Connection] = None


def _get_db_path() -> Path:
    global _THREAD_DB_PATH
    if _THREAD_DB_PATH is None:
        _THREAD_DB_PATH = Path(STORAGE_DIR) / "threads.sqlite"
        _THREAD_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return _THREAD_DB_PATH


def get_checkpointer() -> SqliteSaver:
    """Return a singleton SqliteSaver backed by threads.sqlite."""
    global _SQLITE_SAVER
    if _SQLITE_SAVER is None:
        db_path = _get_db_path()
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        global _METADATA_CONN
        _METADATA_CONN = conn
        _SQLITE_SAVER = SqliteSaver(conn)
        _init_metadata_table(conn)
    return _SQLITE_SAVER


def get_async_checkpointer() -> AsyncSqliteSaver:
    """Return a singleton AsyncSqliteSaver — caller must ``await saver.setup()`` first."""
    global _ASYNC_SQLITE_SAVER
    if _ASYNC_SQLITE_SAVER is None:
        db_path = _get_db_path()
        conn = aiosqlite.connect(str(db_path))
        _ASYNC_SQLITE_SAVER = AsyncSqliteSaver(conn)
    return _ASYNC_SQLITE_SAVER


def _init_metadata_table(conn: sqlite3.Connection) -> None:
    """Ensure the thread_metadata table exists."""
    conn.execute("CREATE TABLE IF NOT EXISTS thread_metadata (thread_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New Chat', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', idea_id TEXT, tags TEXT DEFAULT '[]', agent_names TEXT DEFAULT '[]')")
    try:
        columns = [row[1] for row in conn.execute("PRAGMA table_info(thread_metadata)").fetchall()]
        if "work_item_id" in columns and "idea_id" not in columns:
            conn.execute("ALTER TABLE thread_metadata RENAME COLUMN work_item_id TO idea_id")
    except sqlite3.OperationalError:
        pass
    conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_metadata_updated ON thread_metadata(updated_at DESC)")
    conn.commit()


# ── Thread Metadata CRUD ──────────────────────────────────────────────────


def create_thread(
    title: str = "New Chat",
    idea_id: Optional[str] = None,
    tags: Optional[list[str]] = None,
    agent_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Create a new thread and return its metadata."""
    thread_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_checkpointer().conn
    conn.execute(
        "INSERT INTO thread_metadata (thread_id, title, created_at, updated_at, status, idea_id, tags, agent_names) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
        (thread_id, title, now, now, idea_id, json.dumps(tags or []), json.dumps(agent_names or [])),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM thread_metadata WHERE thread_id = ?", (thread_id,)).fetchone()
    return _row_dict(row) if row else None


def list_threads(
    status: Optional[str] = None,
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


def get_thread(thread_id: str) -> Optional[dict[str, Any]]:
    """Return thread metadata by ID, or None."""
    row = get_checkpointer().conn.execute("SELECT * FROM thread_metadata WHERE thread_id = ?", (thread_id,)).fetchone()
    return _row_dict(row) if row else None


def update_thread(
    thread_id: str,
    **fields: Any,
) -> Optional[dict[str, Any]]:
    """Update thread metadata fields. If 'updated_at' not provided, auto-set to now."""
    allowed = {"title", "status", "idea_id", "tags", "agent_names", "updated_at"}
    to_set = {k: v for k, v in fields.items() if k in allowed}
    if not to_set:
        return get_thread(thread_id)
    to_set.setdefault("updated_at", datetime.now(timezone.utc).isoformat())
    for list_field in ("tags", "agent_names"):
        if list_field in to_set and isinstance(to_set[list_field], list):
            to_set[list_field] = json.dumps(to_set[list_field])
    conn = get_checkpointer().conn
    conn.execute(f"UPDATE thread_metadata SET {', '.join(f'{k} = ?' for k in to_set)} WHERE thread_id = ?", list(to_set.values()) + [thread_id])
    conn.commit()
    return get_thread(thread_id)


def delete_thread(thread_id: str) -> bool:
    """Delete thread metadata. Returns True if existed."""
    conn = get_checkpointer().conn
    cur = conn.execute("DELETE FROM thread_metadata WHERE thread_id = ?", (thread_id,))
    conn.commit()
    return cur.rowcount > 0


async def get_thread_messages(thread_id: str) -> list[dict[str, Any]]:
    """Retrieve messages from a thread's latest checkpoint."""
    import logging
    _logger = logging.getLogger(__name__)
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
    except Exception as exc:
        _logger.error("Failed to get messages for thread %s: %s", thread_id, exc, exc_info=True)
        return []


def touch_thread(thread_id: str) -> None:
    """Update the updated_at timestamp (e.g. after a new message)."""
    conn = get_checkpointer().conn
    conn.execute("UPDATE thread_metadata SET updated_at = ? WHERE thread_id = ?", (datetime.now(timezone.utc).isoformat(), thread_id))
    conn.commit()


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
