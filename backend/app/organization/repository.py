"""SQLite repository for the organization structure (Story 8.1).

Dedicated ``storage/organizations.sqlite`` file, module-singleton
connection per the :mod:`app.services.thread_manager` pattern.
"""

import sqlite3
import threading
from pathlib import Path
from typing import Any

from ..config import STORAGE_DIR

_ORG_DB_PATH: Path | None = None
_ORG_CONN: sqlite3.Connection | None = None
_CONN_LOCK = threading.Lock()


def _get_db_path() -> Path:
    """Return the organizations.sqlite path, creating the storage dir."""
    global _ORG_DB_PATH
    if _ORG_DB_PATH is None:
        _ORG_DB_PATH = Path(STORAGE_DIR) / "organizations.sqlite"
        _ORG_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return _ORG_DB_PATH


def _init_schema(conn: sqlite3.Connection) -> None:
    """Create the organization tables if they do not exist yet."""
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS organizations (
                org_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS departments (
                org_id TEXT NOT NULL,
                department_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                PRIMARY KEY (org_id, department_id)
            );
            CREATE TABLE IF NOT EXISTS teams (
                org_id TEXT NOT NULL,
                department_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                PRIMARY KEY (org_id, department_id, team_id)
            );
            CREATE TABLE IF NOT EXISTS agents (
                org_id TEXT NOT NULL,
                department_id TEXT,
                team_id TEXT,
                agent_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                PRIMARY KEY (org_id, agent_id)
            );
            """
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _get_conn() -> sqlite3.Connection:
    """Return the singleton connection, lazily opening it with WAL mode."""
    global _ORG_CONN
    with _CONN_LOCK:
        if _ORG_CONN is None:
            db_path = _get_db_path()
            _ORG_CONN = sqlite3.connect(str(db_path), check_same_thread=False)
            _ORG_CONN.execute("PRAGMA journal_mode=WAL")
            _ORG_CONN.row_factory = sqlite3.Row
            _init_schema(_ORG_CONN)
    return _ORG_CONN


def _insert_agent_row(
    conn: sqlite3.Connection,
    org_id: str,
    department_id: str | None,
    team_id: str | None,
    agent: dict[str, Any],
) -> None:
    """Insert one agents row (department_id/team_id NULL for org-level)."""
    values = (org_id, department_id, team_id)
    conn.execute(
        "INSERT INTO agents (org_id, department_id, team_id, agent_id, name, role, status)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        values + (agent["agent_id"], agent["name"], agent["role"], agent["status"]),
    )


def insert_organization_tree(
    org_id: str, name: str, description: str, now: str, structure: dict[str, Any]
) -> None:
    """Insert an organization and all its structure rows in one transaction.

    Rolls back on any error so a failed create never leaves a partial
    organization behind (review P1).
    """
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO organizations (org_id, name, description, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (org_id, name, description, now, now),
        )
        _insert_agent_row(conn, org_id, None, None, structure["chief_of_staff"])
        for dept in structure["departments"]:
            conn.execute(
                "INSERT INTO departments (org_id, department_id, name, status)"
                " VALUES (?, ?, ?, ?)",
                (org_id, dept["department_id"], dept["name"], dept["status"]),
            )
            _insert_agent_row(conn, org_id, dept["department_id"], None, dept["chief"])
            for team in dept["teams"]:
                conn.execute(
                    "INSERT INTO teams (org_id, department_id, team_id, name, status)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (org_id, dept["department_id"], team["team_id"], team["name"], team["status"]),
                )
                for agent in [team["captain"], *team["members"]]:
                    _insert_agent_row(
                        conn, org_id, dept["department_id"], team["team_id"], agent
                    )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def get_organization_rows(org_id: str) -> dict[str, Any] | None:
    """Return all rows for one organization, or None if it does not exist.

    Returns a dict with keys ``org`` (the organizations row),
    ``departments``, ``teams`` and ``agents`` (list of rows each).
    """
    conn = _get_conn()
    org = conn.execute(
        "SELECT * FROM organizations WHERE org_id = ?", (org_id,)
    ).fetchone()
    if org is None:
        return None
    departments = conn.execute(
        "SELECT * FROM departments WHERE org_id = ? ORDER BY department_id", (org_id,)
    ).fetchall()
    teams = conn.execute(
        "SELECT * FROM teams WHERE org_id = ? ORDER BY team_id", (org_id,)
    ).fetchall()
    agents = conn.execute(
        "SELECT * FROM agents WHERE org_id = ? ORDER BY agent_id", (org_id,)
    ).fetchall()
    return {"org": org, "departments": departments, "teams": teams, "agents": agents}


def list_organizations() -> list[sqlite3.Row]:
    """Return all organizations (newest update first) with aggregate counts."""
    conn = _get_conn()
    return conn.execute(
        """
        SELECT o.org_id, o.name, o.description, o.created_at, o.updated_at,
               (SELECT COUNT(*) FROM departments d WHERE d.org_id = o.org_id)
                   AS department_count,
               (SELECT COUNT(*) FROM teams t WHERE t.org_id = o.org_id)
                   AS team_count,
               (SELECT COUNT(*) FROM agents a WHERE a.org_id = o.org_id)
                   AS agent_count
        FROM organizations o
        ORDER BY o.updated_at DESC, o.created_at DESC, o.org_id
        """
    ).fetchall()


def _reset_organization_db(conn: sqlite3.Connection | None = None) -> None:
    """Reset the repository singletons (test hook).

    Closes the current connection (best effort) and replaces the globals
    in place — the module is never purged from ``sys.modules``, mirroring
    the thread_manager reset rationale. When ``conn`` is provided it
    becomes the active connection (schema initialized); otherwise the
    next access reopens the file-backed database.
    """
    global _ORG_DB_PATH, _ORG_CONN
    if _ORG_CONN is not None and _ORG_CONN is not conn:
        try:
            _ORG_CONN.close()
        except sqlite3.Error:
            pass
    _ORG_DB_PATH = None
    if conn is None:
        _ORG_CONN = None
        return
    conn.row_factory = sqlite3.Row
    _init_schema(conn)
    _ORG_CONN = conn
