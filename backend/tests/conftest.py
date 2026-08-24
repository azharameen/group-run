"""Shared fixtures for backend tests.

Fixtures
--------
temp_workspace : Temporary workspace with ideas.yaml
isolate_test_env : Autouse — clears OpenAI credentials
patch_config : Points WORKSPACE_DIR at the temp workspace
db_session : Per-test PostgreSQL savepoint rollback for isolated DB tests
mock_agent : AsyncMock agent returned by get_deep_agent_runtime() (AC-1)
mock_supervisor : Stubbed supervisor graph for chat endpoint tests (AC-2)
"""

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Set required environment variables before any app imports.
os.environ.setdefault("LANGGRAPH_STRICT_MSGPACK", "true")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/app_db_test"
)
os.environ.setdefault(
    "DATABASE_DIRECT_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/app_db_test"
)
os.environ.setdefault("DB_SSL_MODE", "prefer")
os.environ.setdefault("DB_AUTO_MIGRATE", "false")


@pytest.fixture(scope="session")
def event_loop():
    """Share a single event loop across the entire test session.

    Prevents SQLAlchemy AsyncEngine and connection pools from being split
    across multiple event loops in pytest-asyncio runs.
    """
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


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
    monkeypatch.setattr("app.agent.domain_tools.WORKSPACE_DIR", temp_workspace)
    return temp_workspace


# ---------------------------------------------------------------------------
# Test DB isolation (PostgreSQL savepoints)
# ---------------------------------------------------------------------------


@pytest.fixture
async def db_session():
    """Per-test PostgreSQL AsyncSession backed by a transaction savepoint.

    Rolls back after each test so tests leave zero residual data in the DB.
    """
    from app.db.session import get_session_factory
    async with get_session_factory()() as session:
        await session.begin_nested()
        yield session
        await session.rollback()


@pytest.fixture
def in_memory_db():
    """Stub fixture for legacy test compatibility."""
    return None


@pytest.fixture
def org_db():
    """Stub fixture for legacy test compatibility."""
    return None


@pytest.fixture
def work_item_db():
    """Stub fixture for legacy test compatibility."""
    return None


# ---------------------------------------------------------------------------
# Agent / supervisor mocks  (AC-1, AC-2)
# ---------------------------------------------------------------------------


def _clear_supervisor():
    """Remove supervisor modules from sys.modules."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.orchestrator.supervisor"):
            del sys.modules[mod]


@pytest.fixture
def mock_agent(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Return an AsyncMock agent and inject it via get_deep_agent_runtime()."""
    agent = AsyncMock()
    agent.ainvoke = AsyncMock(return_value={"output": "mock response"})

    _clear_supervisor()
    from app.orchestrator import supervisor as sup
    monkeypatch.setattr(sup, "_agent", agent)

    return agent


@pytest.fixture
def mock_supervisor(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Return a MagicMock supervisor graph and inject it via get_supervisor_graph()."""
    graph = MagicMock()

    async def _empty_async_gen(**kwargs):
        return  # pylint: disable=implicit-return

    graph.astream = AsyncMock(return_value=_empty_async_gen())

    _clear_supervisor()
    from app.orchestrator import supervisor as sup
    sup._graph = graph

    return graph
