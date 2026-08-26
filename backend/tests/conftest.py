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
from urllib.parse import urlsplit
from unittest.mock import AsyncMock, MagicMock

import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Set required environment variables before any app imports.
os.environ.setdefault("LANGGRAPH_STRICT_MSGPACK", "true")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5433/app_db_test"
)
os.environ.setdefault(
    "DATABASE_DIRECT_URL", "postgresql+psycopg://postgres:postgres@localhost:5433/app_db_test"
)
os.environ.setdefault("DB_SSL_MODE", "prefer")
os.environ.setdefault("DB_AUTO_MIGRATE", "false")
os.environ.setdefault("FIREBASE_PROJECT_ID", "demo-test-project")

_AUTO_TEST_AUTH_HEADERS = True
_DEFAULT_TEST_ID_TOKEN = "test-id-token"


@pytest.fixture(scope="session")
def event_loop():
    """Share a single event loop across the entire test session."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
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
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "demo-test-project")
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


@pytest.fixture(autouse=True)
async def db_cleaner():
    """Ensure a clean database state before each test."""
    from sqlalchemy import text
    from app.db.session import get_session_factory
    async with get_session_factory()() as session:
        for table in (
            "accuracy_reviews", "org_alerts", "workflow_templates",
            "decisions", "lifecycle_events", "routing_decisions",
            "work_items", "agents", "teams", "departments",
            "organizations", "interrupts",
        ):
            await session.execute(text(f"DELETE FROM {table}"))
        await session.commit()
    yield


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


def _is_protected_api_request(method: str, url: str) -> bool:
    path = urlsplit(url).path or url
    return method.upper() != "OPTIONS" and path.startswith("/api") and path not in {
        "/api/health",
        "/api/ready",
    }


@pytest.fixture
def firebase_token_claims() -> dict[str, object]:
    return {
        _DEFAULT_TEST_ID_TOKEN: {
            "uid": "test-user-123",
            "sub": "test-user-123",
            "email": "test@example.com",
            "email_verified": True,
            "name": "Test User",
            "picture": "https://example.com/avatar.png",
            "firebase": {"sign_in_provider": "google.com"},
        }
    }


@pytest.fixture(autouse=True)
def mock_firebase_token_verifier(
    monkeypatch: pytest.MonkeyPatch,
    firebase_token_claims: dict[str, object],
):
    def fake_verify(token: str):
        response = firebase_token_claims.get(token)
        if isinstance(response, Exception):
            raise response
        if isinstance(response, dict):
            return dict(response)
        raise ValueError("invalid test token")

    monkeypatch.setattr("app.auth.firebase.verify_firebase_token", fake_verify)


@pytest.fixture(autouse=True)
def auto_authenticate_test_clients(monkeypatch: pytest.MonkeyPatch):
    from starlette.testclient import TestClient

    original_request = TestClient.request

    def request_with_default_auth(self, method, url, *args, **kwargs):
        headers = dict(kwargs.pop("headers", {}) or {})
        has_authorization = any(key.lower() == "authorization" for key in headers)
        if (
            _AUTO_TEST_AUTH_HEADERS
            and not has_authorization
            and isinstance(url, str)
            and _is_protected_api_request(method, url)
        ):
            headers["Authorization"] = f"Bearer {_DEFAULT_TEST_ID_TOKEN}"
        return original_request(self, method, url, *args, headers=headers, **kwargs)

    monkeypatch.setattr(TestClient, "request", request_with_default_auth)


@pytest.fixture
def disable_auto_auth_headers(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sys.modules[__name__], "_AUTO_TEST_AUTH_HEADERS", False)


@pytest.fixture
def auth_headers():
    def _build(token: str = _DEFAULT_TEST_ID_TOKEN, **extra_headers: str) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {token}"}
        headers.update(extra_headers)
        return headers

    return _build
