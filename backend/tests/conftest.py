"""Shared fixtures for backend tests.

Fixtures
--------
temp_workspace : Temporary workspace with ideas.yaml
isolate_test_env : Autouse — clears OpenAI credentials
patch_config : Points WORKSPACE_DIR at the temp workspace
in_memory_db : In-memory SqliteSaver for thread_manager tests (AC-4)
org_db : In-memory sqlite connection for the organization repository (8.1)
mock_agent : AsyncMock agent returned by get_deep_agent_runtime() (AC-1)
mock_supervisor : Stubbed supervisor graph for chat endpoint tests (AC-2)
"""

import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Set required environment variables before any app imports.
os.environ.setdefault("LANGGRAPH_STRICT_MSGPACK", "true")


@pytest.fixture
def temp_workspace(tmp_path: Path) -> str:
    """Create a temporary workspace directory with ideas.yaml."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    ideas_yaml = ws / "ideas.yaml"
    ideas_yaml.write_text("ideas: []\nnext_id: 1\n", encoding="utf-8")
    ideas_dir = ws / "ideas"
    ideas_dir.mkdir()
    return str(ws)


@pytest.fixture(autouse=True)
def isolate_test_env(monkeypatch: pytest.MonkeyPatch):
    """Prevent real LLM calls in tests by clearing credentials."""
    monkeypatch.setenv("LANGGRAPH_STRICT_MSGPACK", "true")
    monkeypatch.setattr("app.config.settings.openai_api_key", "")
    monkeypatch.setattr("app.config.settings.openai_api_base", "")
    monkeypatch.setattr("app.config.settings.openai_model_name", "")
    monkeypatch.setattr("app.config.settings.deepagents_model", "openai:test-model")


@pytest.fixture
def patch_config(temp_workspace: str, monkeypatch: pytest.MonkeyPatch):
    """Point all WORKSPACE_DIR imports at the temp workspace."""
    monkeypatch.setattr("app.config.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.yaml_io.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.registry.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.idea_workspace.WORKSPACE_DIR", temp_workspace)
    monkeypatch.setattr("app.storage.recovery.WORKSPACE_DIR", temp_workspace)
    return temp_workspace


# ---------------------------------------------------------------------------
# Test DB isolation  (AC-4: in-memory SQLite)
# ---------------------------------------------------------------------------

@pytest.fixture
def in_memory_db(monkeypatch: pytest.MonkeyPatch):
    """Return an in-memory SqliteSaver and inject it as the checkpointer.

    Clears the thread_manager singleton so get_checkpointer() creates a fresh
    connection against ``:memory:``.  Both the supervisor and thread_manager
    modules see the same in-memory instance.

    Usage
    -----
    def test_something(in_memory_db):
        saver = in_memory_db  # SqliteSaver instance
    """
    # Reset singletons before re-import
    _clear_thread_manager()

    from app.services import thread_manager as tm

    # Force in-memory path
    tm._THREAD_DB_PATH = None
    tm._SQLITE_SAVER = None

    # Create a fresh in-memory connection
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row

    # Create the checkpoint tables (SqliteSaver.__init__ does this)
    from langgraph.checkpoint.sqlite import SqliteSaver
    saver = SqliteSaver(conn)
    tm._SQLITE_SAVER = saver

    # Initialize metadata table so CRUD operations work (AC-4)
    tm._init_metadata_table(conn)

    # Also patch supervisor to use the same saver
    _clear_supervisor()
    from app.orchestrator import supervisor as sup
    # supervisor calls get_checkpointer() which now returns our saver

    yield saver

    conn.close()


def _clear_thread_manager():
    """Reset thread_manager singleton state in place (no sys.modules purge).

    Purging the module orphans the function references already held by
    imported app modules (routes, supervisor, app) — they keep operating on
    the old module object's singletons while fresh imports use a new module
    instance, so checkpoint writes and reads can hit different connections.
    Keeping a single module instance and resetting its state avoids that.
    """
    from app.services import thread_manager as tm
    from app.services.thread_manager import _discard_async_saver

    _discard_async_saver(tm._ASYNC_SQLITE_SAVER)
    if tm._SQLITE_SAVER is not None:
        try:
            tm._SQLITE_SAVER.conn.close()
        except Exception:
            pass
    tm._SQLITE_SAVER = None
    tm._ASYNC_SQLITE_SAVER = None
    tm._THREAD_DB_PATH = None
    tm._METADATA_CONN = None


def _clear_supervisor():
    """Remove supervisor modules from sys.modules."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.orchestrator.supervisor"):
            del sys.modules[mod]


@pytest.fixture
def org_db():
    """Yield an in-memory organization DB injected into the repository.

    Resets the organization repository singleton in place (same
    rationale as :func:`_clear_thread_manager` — never purge
    ``sys.modules``) and points it at a fresh ``:memory:`` connection
    with the org schema initialized, so every test gets an isolated,
    empty organization database.

    Usage
    -----
    def test_something(org_db):
        from app.organization import service  # operates on the in-memory DB
    """
    from app.organization import repository as org_repo

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    org_repo._reset_organization_db(conn)

    yield conn

    conn.close()
    # Clear the singleton so the closed in-memory connection is never served
    # to a later test that skips this fixture (review P4).
    org_repo._reset_organization_db()


# ---------------------------------------------------------------------------
# Agent / supervisor mocks  (AC-1, AC-2)
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_agent(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Return an AsyncMock agent and inject it via get_deep_agent_runtime().

    The mock's ``ainvoke()`` method resolves to ``{"output": "mock response"}``.
    Override with ``mock_agent.ainvoke.return_value = ...`` or
    ``mock_agent.ainvoke.side_effect = ...`` for specific scenarios.

    Usage
    -----
    def test_supervisor(mock_agent):
        mock_agent.ainvoke.side_effect = asyncio.TimeoutError()
        # ... exercise supervisor_general()
    """
    agent = AsyncMock()
    agent.ainvoke = AsyncMock(return_value={"output": "mock response"})

    _clear_supervisor()
    from app.orchestrator import supervisor as sup
    monkeypatch.setattr(sup, "_agent", agent)

    return agent


@pytest.fixture
def mock_supervisor(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Return a MagicMock supervisor graph and inject it via get_supervisor_graph().

    The mock's ``astream()`` method resolves to an empty async iterator by
    default.  Override with ``mock_supervisor.astream.return_value = ...``.

    Usage
    -----
    async def test_chat_endpoint(mock_supervisor):
        async def _gen():
            yield {"response": "hello", "routing_key": "general"}
        mock_supervisor.astream.return_value = _gen()
    """
    graph = MagicMock()

    async def _empty_async_gen(**kwargs):
        return  # pylint: disable=implicit-return

    graph.astream = AsyncMock(return_value=_empty_async_gen())

    _clear_supervisor()
    from app.orchestrator import supervisor as sup
    sup._graph = graph

    return graph
