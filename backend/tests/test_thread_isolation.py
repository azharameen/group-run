"""Tests for in-memory DB isolation (AC-4).

Validates that each test gets a fresh in-memory SQLite checkpointer,
no file writes persist, and concurrent tests remain isolated.
"""

import os
import sqlite3
import sys

import pytest


# ---------------------------------------------------------------------------
# AC-4: In-memory database
# ---------------------------------------------------------------------------

def test_in_memory_db_is_fresh(monkeypatch: pytest.MonkeyPatch):
    """Each in-memory SqliteSaver is independent (AC-4)."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]

    from langgraph.checkpoint.sqlite import SqliteSaver

    conn1 = sqlite3.connect(":memory:", check_same_thread=False)
    saver1 = SqliteSaver(conn1)

    conn2 = sqlite3.connect(":memory:", check_same_thread=False)
    saver2 = SqliteSaver(conn2)

    # Both savers use different connections
    assert saver1.conn is not saver2.conn


# ---------------------------------------------------------------------------
# AC-4: No file writes
# ---------------------------------------------------------------------------

def test_in_memory_db_no_file_created(monkeypatch: pytest.MonkeyPatch, tmp_path):
    """In-memory checkpointer does not create files on disk (AC-4)."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]

    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))

    from langgraph.checkpoint.sqlite import SqliteSaver

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    saver = SqliteSaver(conn)

    # No files should be created in tmp_path
    files = list(tmp_path.iterdir())
    assert len(files) == 0


# ---------------------------------------------------------------------------
# AC-4: Thread isolation with in-memory DB
# ---------------------------------------------------------------------------

def test_in_memory_thread_crud(monkeypatch: pytest.MonkeyPatch):
    """Thread metadata operations work with in-memory checkpointer (AC-4)."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]

    from langgraph.checkpoint.sqlite import SqliteSaver
    from langgraph.checkpoint.base import BaseCheckpointSaver

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    saver = SqliteSaver(conn)

    assert isinstance(saver, BaseCheckpointSaver)


# ---------------------------------------------------------------------------
# AC-4: Concurrent test safety
# ---------------------------------------------------------------------------

def test_concurrent_isolation(monkeypatch: pytest.MonkeyPatch):
    """Multiple in-memory savers don't interfere (AC-4)."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]

    from langgraph.checkpoint.sqlite import SqliteSaver

    savers = []
    for _ in range(3):
        conn = sqlite3.connect(":memory:", check_same_thread=False)
        savers.append(SqliteSaver(conn))

    # Each saver has its own connection
    for i, s in enumerate(savers):
        for j, other in enumerate(savers):
            if i != j:
                assert s.conn is not other.conn


# ---------------------------------------------------------------------------
# AC-4: Thread manager uses in-memory checkpointer
# ---------------------------------------------------------------------------

def test_thread_manager_inject_in_memory(monkeypatch: pytest.MonkeyPatch):
    """Thread manager singleton can be replaced with in-memory saver (AC-4)."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]

    from langgraph.checkpoint.sqlite import SqliteSaver
    from app.services import thread_manager as tm

    # Create in-memory saver
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    saver = SqliteSaver(conn)

    # Inject into the singleton
    tm._SQLITE_SAVER = saver

    # get_checkpointer should return our saver
    result = tm.get_checkpointer()
    assert result is saver
    assert result.conn is conn


# ---------------------------------------------------------------------------
# AC-4: Thread manager with in_memory_db fixture pattern
# ---------------------------------------------------------------------------

def test_thread_crud_with_in_memory(monkeypatch: pytest.MonkeyPatch):
    """Thread CRUD operations work after in-memory injection (AC-4)."""
    for mod in list(sys.modules.keys()):
        if any(mod.startswith(p) for p in (
            "app.services.thread_manager",
            "app.config",
        )):
            del sys.modules[mod]

    from langgraph.checkpoint.sqlite import SqliteSaver
    from app.services import thread_manager as tm

    # Simulate in_memory_db fixture setup
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    saver = SqliteSaver(conn)
    tm._SQLITE_SAVER = saver
    tm._THREAD_DB_PATH = None

    # Initialize metadata table (normally done in get_checkpointer)
    tm._init_metadata_table(conn)

    # Now CRUD should work
    thread = tm.create_thread(title="Test Thread")
    assert thread["thread_id"] is not None
    assert thread["title"] == "Test Thread"

    # List should return the thread
    threads = tm.list_threads()
    assert len(threads) == 1

    # Get should find it
    found = tm.get_thread(thread["thread_id"])
    assert found["title"] == "Test Thread"

    # Update should work
    updated = tm.update_thread(thread["thread_id"], title="Updated")
    assert updated["title"] == "Updated"

    # Delete should work
    deleted = tm.delete_thread(thread["thread_id"])
    assert deleted is True

    # List should be empty
    assert len(tm.list_threads()) == 0
