"""Tests for Story 8.2 — submit a work item and route it to the correct department.

Covers acceptance criteria:
- AC #1: POST creates the item with status "new", owner chief_of_staff
- AC #2: routing is deterministic (valid hint high / missing-or-invalid default low)
- AC #3: the routing decision persists with provenance (who/when/why)
- AC #4: work items are listable and fetchable for the Command Center view
- AC #5: the runtime exposes submit_work_item to the deep agent
"""

import sys
import types
from unittest.mock import MagicMock

import pytest
from app.api.app import create_app
from app.organization import service as org_service
from app.work_items import service as work_items_service
from app.work_items.models import OWNER_AGENT_ID, STATUS_NEW
from app.work_items.service import NoOrganizationError, UnknownOrganizationError
from fastapi.testclient import TestClient


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work item DBs.

    No context manager, matching the existing API test pattern — the app
    lifespan (checkpointer/threads.sqlite) is never started.
    """
    return TestClient(create_app())


@pytest.fixture
def organization(org_db):
    """A default-structure organization to submit work items into."""
    return org_service.create_organization("Acme Robotics")


class TestSubmitWorkItemService:
    """AC #1 — service-level create semantics."""

    def test_create_defaults(self, organization, work_item_db):
        item = work_items_service.submit_work_item(
            "Automated inventory scanner", org_id=organization.org_id
        )
        assert item.work_item_id
        assert item.org_id == organization.org_id
        assert item.title == "Automated inventory scanner"
        assert item.status == STATUS_NEW
        assert item.owner_agent_id == OWNER_AGENT_ID

    def test_create_requires_an_organization(self, work_item_db):
        with pytest.raises(NoOrganizationError):
            work_items_service.submit_work_item("Orphan idea")

    def test_create_blank_title_rejected(self, organization, work_item_db):
        with pytest.raises(ValueError):
            work_items_service.submit_work_item("   ")

    def test_create_unknown_organization(self, work_item_db):
        with pytest.raises(UnknownOrganizationError):
            work_items_service.submit_work_item("Ghost org item", org_id="does-not-exist")


class TestRouting:
    """AC #2 + AC #3 — deterministic routing with persisted provenance."""

    def test_default_routing_low_confidence(self, organization, work_item_db):
        item = work_items_service.submit_work_item(
            "New concept", org_id=organization.org_id
        )
        assert item.department_id == "ideation"
        assert item.routing.confidence == "low"
        assert item.routing.decided_by == OWNER_AGENT_ID
        assert item.routing.decided_at
        assert "ideation" in item.routing.reasoning
        assert item.routing.alternatives == ["technology"]

    def test_explicit_valid_hint_high_confidence(self, organization, work_item_db):
        item = work_items_service.submit_work_item(
            "Refactor build pipeline",
            org_id=organization.org_id,
            department="technology",
        )
        assert item.department_id == "technology"
        assert item.routing.confidence == "high"
        assert item.routing.alternatives == ["ideation"]

    def test_invalid_hint_falls_back_and_quotes_hint(self, organization, work_item_db):
        item = work_items_service.submit_work_item(
            "Mystery", org_id=organization.org_id, department="legal"
        )
        assert item.department_id == "ideation"
        assert item.routing.confidence == "low"
        assert "legal" in item.routing.reasoning

    def test_blank_hint_treated_as_missing(self, organization, work_item_db):
        item = work_items_service.submit_work_item(
            "Whitespace hint", org_id=organization.org_id, department="   "
        )
        assert item.department_id == "ideation"
        assert item.routing.confidence == "low"
        assert "No department specified" in item.routing.reasoning

    def test_decision_persists_with_item(self, organization, work_item_db):
        item = work_items_service.submit_work_item(
            "Persistence check", org_id=organization.org_id
        )
        stored = work_items_service.get_work_item(item.work_item_id)
        assert stored is not None
        assert stored.routing.model_dump() == item.routing.model_dump()
        assert stored.department_id == item.department_id


class TestWorkItemListing:
    """AC #4 (data side) — ordering, filtering, missing items."""

    def test_list_newest_first_and_filter(self, organization, org_db, work_item_db):
        other_org = org_service.create_organization("Second Org")
        work_items_service.submit_work_item("A", org_id=organization.org_id)
        work_items_service.submit_work_item("B", org_id=organization.org_id)
        work_items_service.submit_work_item("C", org_id=other_org.org_id)

        org_items = work_items_service.list_work_items(organization.org_id)
        assert [item.title for item in org_items] == ["B", "A"]

        all_items = work_items_service.list_work_items()
        assert [item.title for item in all_items] == ["C", "B", "A"]

    def test_missing_item_returns_none(self, work_item_db):
        assert work_items_service.get_work_item("nope") is None


class TestWorkItemsApi:
    """AC #1 + AC #4 — the /api/work-items endpoints."""

    def test_post_creates_work_item(self, client, organization):
        response = client.post(
            "/api/work-items",
            json={"title": "Sensor fusion for AGV", "org_id": organization.org_id},
        )
        assert response.status_code == 201
        body = response.json()["work_item"]
        assert body["status"] == "new"
        assert body["owner_agent_id"] == "chief_of_staff"
        assert body["department_id"] == "ideation"
        assert body["routing"]["decided_by"] == "chief_of_staff"
        assert body["source"] == "api"

    def test_post_blank_title_400(self, client, organization):
        response = client.post(
            "/api/work-items",
            json={"title": "   ", "org_id": organization.org_id},
        )
        assert response.status_code == 400

    def test_post_overlong_title_400(self, client, organization):
        response = client.post(
            "/api/work-items", json={"title": "x" * 201, "org_id": organization.org_id}
        )
        assert response.status_code == 400

    def test_post_unknown_org_404(self, client):
        response = client.post(
            "/api/work-items", json={"title": "T", "org_id": "nope"}
        )
        assert response.status_code == 404

    def test_post_without_organization_404(self, client):
        response = client.post("/api/work-items", json={"title": "T"})
        assert response.status_code == 404
        assert "organization" in response.json()["detail"].lower()

    def test_list_and_get(self, client, organization):
        created = client.post(
            "/api/work-items",
            json={"title": "List me", "org_id": organization.org_id},
        ).json()["work_item"]

        listing = client.get("/api/work-items", params={"org_id": organization.org_id})
        assert listing.status_code == 200
        assert listing.json()["count"] == 1
        assert listing.json()["work_items"][0]["title"] == "List me"

        fetched = client.get(f"/api/work-items/{created['work_item_id']}")
        assert fetched.status_code == 200
        assert fetched.json()["work_item"]["title"] == "List me"

        assert client.get("/api/work-items/missing").status_code == 404

    def test_list_without_org_lists_all(self, client, organization, org_db):
        other_org = org_service.create_organization("Other Org")
        client.post("/api/work-items", json={"title": "A", "org_id": organization.org_id})
        client.post("/api/work-items", json={"title": "B", "org_id": other_org.org_id})
        listing = client.get("/api/work-items")
        assert listing.status_code == 200
        assert listing.json()["count"] == 2

    def test_list_unknown_org_404(self, client):
        response = client.get("/api/work-items", params={"org_id": "nope"})
        assert response.status_code == 404


class TestSubmitWorkItemTool:
    """AC #1 (chat) — the tool confirms in chat and never raises."""

    def test_tool_is_exposed_and_named(self):
        from app.work_items.tools import DOMAIN_TOOLS

        assert [tool.name for tool in DOMAIN_TOOLS] == ["submit_work_item"]

    def test_tool_success_confirmation(self, organization, work_item_db):
        from app.work_items.tools import submit_work_item

        result = submit_work_item.invoke(
            {"title": "Chat idea", "description": "detail"}
        )
        assert "Chat idea" in result
        assert "new" in result
        assert "ideation" in result
        assert "Command Center" in result

    def test_tool_without_organization_returns_error_string(self, org_db, work_item_db):
        from app.work_items.tools import submit_work_item

        result = submit_work_item.invoke({"title": "Orphan"})
        assert "Could not submit" in result
        assert "organization" in result.lower()

    def test_tool_blank_title_returns_error_string(self, organization, work_item_db):
        from app.work_items.tools import submit_work_item

        result = submit_work_item.invoke({"title": "   "})
        assert "Could not submit" in result
        assert "title" in result.lower()


class TestRuntimeToolWiring:
    """AC #5 — the deep agent runtime exposes submit_work_item."""

    def test_domain_tools_in_runtime(self, monkeypatch):
        # Same mock recipe as test_skills_wiring.py: stub deepagents and
        # capture the kwargs create_deep_agent receives.
        deepagents_module = types.ModuleType("deepagents")
        backends_module = types.ModuleType("deepagents.backends")
        middleware_module = types.ModuleType("deepagents.middleware")
        skills_middleware_module = types.ModuleType("deepagents.middleware.skills")

        captured_kwargs = {}

        def mock_create_deep_agent(**kwargs):
            captured_kwargs.update(kwargs)
            return MagicMock()

        deepagents_module.create_deep_agent = mock_create_deep_agent
        deepagents_module.DeepAgentState = MagicMock()
        backends_module.CompositeBackend = MagicMock()
        backends_module.FilesystemBackend = MagicMock()
        backends_module.StateBackend = MagicMock()
        skills_middleware_module.SkillsMiddleware = MagicMock()

        monkeypatch.setitem(sys.modules, "deepagents", deepagents_module)
        monkeypatch.setitem(sys.modules, "deepagents.backends", backends_module)
        monkeypatch.setitem(sys.modules, "deepagents.middleware", middleware_module)
        monkeypatch.setitem(sys.modules, "deepagents.middleware.skills", skills_middleware_module)
        monkeypatch.setitem(sys.modules, "langgraph.checkpoint.sqlite", MagicMock())

        thread_manager_module = types.ModuleType("app.services.thread_manager")
        thread_manager_module.get_checkpointer = MagicMock(return_value=MagicMock())
        thread_manager_module.get_async_checkpointer = MagicMock(return_value=MagicMock())
        monkeypatch.setitem(
            sys.modules, "app.services.thread_manager", thread_manager_module
        )

        for mod in list(sys.modules.keys()):
            if any(
                mod.startswith(prefix)
                for prefix in [
                    "app.agent.permissions",
                    "app.agent.backends",
                    "app.agent.context",
                    "app.agent.runtime",
                ]
            ):
                monkeypatch.delitem(sys.modules, mod, raising=False)
        app_agent_backends = types.ModuleType("app.agent.backends")
        app_agent_backends.build_agent_backend = MagicMock()
        monkeypatch.setitem(sys.modules, "app.agent.backends", app_agent_backends)
        monkeypatch.setitem(sys.modules, "app.agent.permissions", MagicMock())
        monkeypatch.setitem(sys.modules, "app.agent.context", MagicMock())

        from app.agent.runtime import get_deep_agent_runtime
        from app.config import settings

        original_model = settings.deepagents_model
        settings.deepagents_model = "openai:test-model"
        try:
            import app.agent.runtime as runtime_mod

            monkeypatch.setattr(runtime_mod, "_load_mcp_tools", lambda: [])
            get_deep_agent_runtime()
        finally:
            settings.deepagents_model = original_model

        tool_names = [
            getattr(tool, "name", None) for tool in captured_kwargs.get("tools", [])
        ]
        assert "submit_work_item" in tool_names
