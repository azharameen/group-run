"""Unit tests for transaction atomicity and rollback behavior (Story #16)."""

import sqlite3
from unittest.mock import MagicMock, patch

import pytest

from app.organization import repository as org_repo
from app.organization.service import DEFAULT_ORG_STRUCTURE
from app.services import thread_manager
from app.services.interrupt_service import InterruptService
from app.work_items import lifecycle_repository, repository as work_repo


class ConnectionProxy:
    """Wrapper proxy around sqlite3.Connection to allow method patching."""

    def __init__(self, real_conn: sqlite3.Connection, fail_on_sql_substring: str | None = None) -> None:
        self._conn = real_conn
        self.fail_on_sql_substring = fail_on_sql_substring

    def execute(self, sql: str, *args, **kwargs):
        if self.fail_on_sql_substring and self.fail_on_sql_substring in sql:
            raise sqlite3.OperationalError(f"Simulated error for sql matching {self.fail_on_sql_substring}")
        return self._conn.execute(sql, *args, **kwargs)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def fetchone(self):
        return self._conn.fetchone()

    def fetchall(self):
        return self._conn.fetchall()


@pytest.fixture
def memory_db():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def test_organization_tree_insert_rollback(memory_db):
    """Verify that a failure during organization tree insertion rolls back all tables."""
    org_repo._reset_organization_db(memory_db)
    org_id = "test-org-rollback-1"
    now = "2025-01-01T00:00:00Z"

    # Malformed structure missing required keys for departments
    corrupt_structure = {
        "chief_of_staff": DEFAULT_ORG_STRUCTURE["chief_of_staff"],
        "departments": [
            {
                "department_id": "ideation",
                "name": "Ideation",
                "status": "idle",
                "chief": DEFAULT_ORG_STRUCTURE["departments"][0]["chief"],
                "teams": "INVALID_TEAMS_TYPE_RAISES_TYPE_ERROR",  # Not iterable as dict
            }
        ],
    }

    with pytest.raises(TypeError):
        org_repo.insert_organization_tree(
            org_id, "Test Org", "Desc", now, corrupt_structure
        )

    # Check that organizations, departments, teams, and agents are ALL empty
    assert memory_db.execute("SELECT COUNT(*) FROM organizations").fetchone()[0] == 0
    assert memory_db.execute("SELECT COUNT(*) FROM departments").fetchone()[0] == 0
    assert memory_db.execute("SELECT COUNT(*) FROM teams").fetchone()[0] == 0
    assert memory_db.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0


def test_work_item_insert_rollback(memory_db):
    """Verify that a failure during work item insertion rolls back work_items and routing_decisions."""
    work_repo._reset_work_item_db(memory_db)

    item = {
        "work_item_id": "wi-rollback-1",
        "org_id": "org-1",
        "title": "Test Title",
        "description": "Test Desc",
        "status": "new",
        "owner_agent_id": "chief_of_staff",
        "source": "api",
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    }
    # Corrupt routing missing department_id key
    corrupt_routing = {"decided_by": "chief_of_staff"}

    with pytest.raises(KeyError):
        work_repo.insert_work_item(item, corrupt_routing)

    # Check that neither work_items nor routing_decisions has any rows
    assert memory_db.execute("SELECT COUNT(*) FROM work_items").fetchone()[0] == 0
    assert memory_db.execute("SELECT COUNT(*) FROM routing_decisions").fetchone()[0] == 0


def test_record_transition_rollback(memory_db):
    """Verify that a failure during transition recording preserves original status and logs no event."""
    work_repo._reset_work_item_db(memory_db)

    item = {
        "work_item_id": "wi-rollback-2",
        "org_id": "org-1",
        "title": "Test Title",
        "description": "Test Desc",
        "status": "new",
        "owner_agent_id": "chief_of_staff",
        "source": "api",
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    }
    routing = {
        "department_id": "ideation",
        "decided_by": "chief_of_staff",
        "decided_at": "2025-01-01T00:00:00Z",
        "confidence": "high",
        "reasoning": "Test",
        "alternatives": [],
    }
    work_repo.insert_work_item(item, routing)

    # Attempt transition with corrupt event dict missing required keys for insert_lifecycle_event
    corrupt_event = {"event_id": "evt-1"}

    with pytest.raises(KeyError):
        lifecycle_repository.record_transition(
            "wi-rollback-2",
            "elaboration",
            "ideation",
            "2025-01-01T01:00:00Z",
            corrupt_event,
            expected_status="new",
        )

    # Verify status is still 'new' and lifecycle_events is empty
    row = memory_db.execute("SELECT status FROM work_items WHERE work_item_id = ?", ("wi-rollback-2",)).fetchone()
    assert row["status"] == "new"
    assert memory_db.execute("SELECT COUNT(*) FROM lifecycle_events").fetchone()[0] == 0


def test_update_work_item_status_concurrent_rollback(memory_db):
    """Verify concurrent status mismatch raises ValueError and rolls back."""
    work_repo._reset_work_item_db(memory_db)

    item = {
        "work_item_id": "wi-rollback-3",
        "org_id": "org-1",
        "title": "Test Title",
        "description": "Test Desc",
        "status": "new",
        "owner_agent_id": "chief_of_staff",
        "source": "api",
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    }
    routing = {
        "department_id": "ideation",
        "decided_by": "chief_of_staff",
        "decided_at": "2025-01-01T00:00:00Z",
        "confidence": "high",
        "reasoning": "Test",
        "alternatives": [],
    }
    work_repo.insert_work_item(item, routing)

    with pytest.raises(ValueError, match="status changed concurrently"):
        lifecycle_repository.update_work_item_status(
            "wi-rollback-3",
            "elaboration",
            "ideation",
            "2025-01-01T01:00:00Z",
            expected_status="wrong_status",
            commit=True,
        )

    # Confirm status is unchanged
    row = memory_db.execute("SELECT status FROM work_items WHERE work_item_id = ?", ("wi-rollback-3",)).fetchone()
    assert row["status"] == "new"


def test_thread_manager_write_rollback(memory_db):
    """Verify thread manager operations invoke rollback on execution error."""
    thread_manager._init_metadata_table(memory_db)

    proxy_conn = ConnectionProxy(memory_db)
    mock_checkpointer = MagicMock()
    mock_checkpointer.conn = proxy_conn

    with patch("app.services.thread_manager.get_checkpointer", return_value=mock_checkpointer):
        # Create thread successfully
        thread = thread_manager.create_thread("Test Thread")
        assert thread is not None
        thread_id = thread["thread_id"]

        # Configure proxy to fail on UPDATE
        proxy_conn.fail_on_sql_substring = "UPDATE thread_metadata"
        with pytest.raises(sqlite3.OperationalError):
            thread_manager.update_thread(thread_id, title="New Title")

        # Original title remains intact
        row = memory_db.execute("SELECT title FROM thread_metadata WHERE thread_id = ?", (thread_id,)).fetchone()
        assert row["title"] == "Test Thread"


def test_interrupt_service_write_rollback(memory_db):
    """Verify interrupt service rolls back when database fails."""
    service = InterruptService.instance()
    proxy_conn = ConnectionProxy(memory_db)
    service._conn_obj = proxy_conn  # type: ignore[assignment]
    service._init_table()

    # Configure proxy to fail on INSERT
    proxy_conn.fail_on_sql_substring = "INSERT INTO interrupts"

    with pytest.raises(sqlite3.OperationalError):
        service.create_interrupt("t1", "tool_a", "msg")

    assert memory_db.execute("SELECT COUNT(*) FROM interrupts").fetchone()[0] == 0
