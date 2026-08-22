"""SQLite repository for work items and routing decisions (Story 8.2).
Dedicated ``storage/work_items.sqlite`` file, module-singleton
connection mirroring :mod:`app.organization.repository` (AD-3: one
storage file per entity — never shared with threads.sqlite).
"""
import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from ..config import STORAGE_DIR
from .models import LIFECYCLE_PHASES

_OPEN_LIFECYCLE_PHASES = tuple(
    phase for phase in LIFECYCLE_PHASES if phase != "monitoring"
)

_WORK_ITEM_DB_PATH: Path | None = None
_WORK_ITEM_CONN: sqlite3.Connection | None = None
_CONN_LOCK = threading.Lock()
def _get_db_path() -> Path:
    """Return the work_items.sqlite path, creating the storage dir."""
    global _WORK_ITEM_DB_PATH
    if _WORK_ITEM_DB_PATH is None:
        _WORK_ITEM_DB_PATH = Path(STORAGE_DIR) / "work_items.sqlite"
        _WORK_ITEM_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return _WORK_ITEM_DB_PATH
def _init_schema(conn: sqlite3.Connection) -> None:
    """Create the work item tables if they do not exist yet."""
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS work_items (
                work_item_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'new',
                owner_agent_id TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'api',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
                ,department_id TEXT NOT NULL DEFAULT 'ideation'
            );
            CREATE TABLE IF NOT EXISTS routing_decisions (
                work_item_id TEXT PRIMARY KEY,
                department_id TEXT NOT NULL,
                decided_by TEXT NOT NULL,
                decided_at TEXT NOT NULL,
                confidence TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                alternatives TEXT NOT NULL DEFAULT '[]'
            );
            CREATE INDEX IF NOT EXISTS idx_work_items_org_created
                ON work_items (org_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS lifecycle_events (
                event_id TEXT PRIMARY KEY,
                work_item_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                from_status TEXT NOT NULL,
                to_status TEXT NOT NULL,
                from_department TEXT NOT NULL,
                to_department TEXT NOT NULL,
                decided_by TEXT NOT NULL,
                decided_at TEXT NOT NULL,
                confidence TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                alternatives TEXT NOT NULL DEFAULT '[]'
            );
            CREATE INDEX IF NOT EXISTS idx_lifecycle_events_item_time
                ON lifecycle_events (work_item_id, decided_at);
            CREATE TABLE IF NOT EXISTS decisions (
                decision_id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL,
                agent_id TEXT NOT NULL, decision_type TEXT NOT NULL,
                reasoning TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '[]',
                confidence TEXT NOT NULL, alternatives TEXT NOT NULL DEFAULT '[]',
                decided_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_decisions_item_time
                ON decisions (work_item_id, decided_at);
            CREATE INDEX IF NOT EXISTS idx_decisions_agent_time
                ON decisions (agent_id, decided_at);
            CREATE TABLE IF NOT EXISTS org_alerts (
                alert_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                work_item_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                reason TEXT NOT NULL,
                raised_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_org_alerts_dedupe
                ON org_alerts (org_id, work_item_id, phase);
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(work_items)")}
        if "department_id" not in columns:
            conn.execute("ALTER TABLE work_items ADD COLUMN department_id TEXT NOT NULL DEFAULT 'ideation'")
            conn.execute(
                "UPDATE work_items SET department_id = (SELECT department_id FROM "
                "routing_decisions WHERE routing_decisions.work_item_id = work_items.work_item_id)"
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
def _get_conn() -> sqlite3.Connection:
    """Return the singleton connection, lazily opening it with WAL mode."""
    global _WORK_ITEM_CONN
    with _CONN_LOCK:
        if _WORK_ITEM_CONN is None:
            db_path = _get_db_path()
            _WORK_ITEM_CONN = sqlite3.connect(str(db_path), check_same_thread=False)
            _WORK_ITEM_CONN.execute("PRAGMA journal_mode=WAL")
            _WORK_ITEM_CONN.row_factory = sqlite3.Row
            _init_schema(_WORK_ITEM_CONN)
    return _WORK_ITEM_CONN
def _routing_map(conn: sqlite3.Connection, work_item_ids: list[str]) -> dict[str, sqlite3.Row]:
    """Fetch routing decision rows for the given ids in one query."""
    if not work_item_ids:
        return {}
    placeholders = ",".join("?" for _ in work_item_ids)
    rows = conn.execute(
        f"SELECT * FROM routing_decisions WHERE work_item_id IN ({placeholders})",
        work_item_ids,
    ).fetchall()
    return {row["work_item_id"]: row for row in rows}
def insert_work_item(item: dict[str, Any], routing: dict[str, Any]) -> None:
    """Insert a work item and its routing decision in one transaction.
    Rolls back on any error so a failed submit never leaves a work
    item behind without its routing decision.
    """
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO work_items (work_item_id, org_id, title, description,"
            " status, owner_agent_id, source, created_at, updated_at, department_id)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                item["work_item_id"],
                item["org_id"],
                item["title"],
                item["description"],
                item["status"],
                item["owner_agent_id"],
                item["source"],
                item["created_at"],
                item["updated_at"],
                routing["department_id"],
            ),
        )
        conn.execute(
            "INSERT INTO routing_decisions (work_item_id, department_id,"
            " decided_by, decided_at, confidence, reasoning, alternatives)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                item["work_item_id"],
                routing["department_id"],
                routing["decided_by"],
                routing["decided_at"],
                routing["confidence"],
                routing["reasoning"],
                json.dumps(routing["alternatives"]),
            ),
        )
        insert_decision({
            "decision_id": str(__import__("uuid").uuid4()),
            "work_item_id": item["work_item_id"], "agent_id": routing["decided_by"],
            "decision_type": "routing", "reasoning": routing["reasoning"],
            "evidence": [], "confidence": routing["confidence"],
            "alternatives": routing["alternatives"], "decided_at": routing["decided_at"],
        }, commit=False)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
def get_work_item_rows(work_item_id: str) -> dict[str, Any] | None:
    """Return the work item row and its routing decision row, or None."""
    conn = _get_conn()
    item = conn.execute(
        "SELECT * FROM work_items WHERE work_item_id = ?", (work_item_id,)
    ).fetchone()
    if item is None:
        return None
    routing = conn.execute(
        "SELECT * FROM routing_decisions WHERE work_item_id = ?", (work_item_id,)
    ).fetchone()
    return {"item": item, "routing": routing}
def list_work_items_with_routing(org_id: str | None = None) -> list[dict[str, Any]]:
    """Return work items (newest first) paired with their routing rows.
    ``org_id=None`` lists across all organizations.
    """
    conn = _get_conn()
    if org_id is None:
        item_rows = conn.execute(
            "SELECT * FROM work_items ORDER BY created_at DESC, rowid DESC"
        ).fetchall()
    else:
        item_rows = conn.execute(
            "SELECT * FROM work_items WHERE org_id = ?"
            " ORDER BY created_at DESC, rowid DESC",
            (org_id,),
        ).fetchall()
    routing = _routing_map(conn, [row["work_item_id"] for row in item_rows])
    return [
        {"item": row, "routing": routing.get(row["work_item_id"])} for row in item_rows
    ]
def count_open_work_items_by_department(org_id: str) -> dict[str, int]:
    """Count open work items per department for one organization.

    Open means the item is in a lifecycle phase other than ``monitoring``
    (the terminal phase). Returns ``{department_id: count}`` with only
    departments that have at least one open item.
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT department_id, COUNT(*) AS n FROM work_items"
        f" WHERE org_id = ? AND status IN ({','.join('?' for _ in _OPEN_LIFECYCLE_PHASES)})"
        " GROUP BY department_id",
        (org_id, *_OPEN_LIFECYCLE_PHASES),
    ).fetchall()
    return {row["department_id"]: row["n"] for row in rows}


def insert_decision(decision: dict[str, Any], commit: bool = True) -> None:
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (decision["decision_id"], decision["work_item_id"], decision["agent_id"],
             decision["decision_type"], decision["reasoning"], json.dumps(decision.get("evidence", [])),
             decision["confidence"], json.dumps(decision.get("alternatives", [])),
             decision["decided_at"]),
        )
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise


def list_decisions(work_item_id=None, agent_id=None, from_ts=None, to_ts=None):
    conn = _get_conn()
    clauses, values = [], []
    for column, value, operator in (("work_item_id", work_item_id, "="), ("agent_id", agent_id, "="),
                                    ("decided_at", from_ts, ">="), ("decided_at", to_ts, "<=")):
        if value is not None:
            clauses.append(f"{column} {operator} ?")
            values.append(value)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    return conn.execute(f"SELECT * FROM decisions{where} ORDER BY decided_at ASC, rowid ASC", values).fetchall()


def __getattr__(name: str) -> Any:
    if name in (
        "insert_lifecycle_event",
        "list_lifecycle_events",
        "record_transition",
        "update_work_item_status",
        "insert_org_alert",
        "list_org_alerts",
        "has_org_alert",
        "record_reassignment",
        "record_escalation",
    ):
        from . import lifecycle_repository
        return getattr(lifecycle_repository, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def _reset_work_item_db(conn: sqlite3.Connection | None = None) -> None:
    """Reset the repository singletons (test hook).
    Closes the current connection (best effort) and replaces the globals
    in place — the module is never purged from ``sys.modules``, mirroring
    the organization repository reset rationale. When ``conn`` is
    provided it becomes the active connection (schema initialized);
    otherwise the next access reopens the file-backed database.
    """
    global _WORK_ITEM_DB_PATH, _WORK_ITEM_CONN
    if _WORK_ITEM_CONN is not None and _WORK_ITEM_CONN is not conn:
        try:
            _WORK_ITEM_CONN.close()
        except sqlite3.Error:
            pass
    _WORK_ITEM_DB_PATH = None
    if conn is None:
        _WORK_ITEM_CONN = None
        return
    conn.row_factory = sqlite3.Row
    _init_schema(conn)
    _WORK_ITEM_CONN = conn
