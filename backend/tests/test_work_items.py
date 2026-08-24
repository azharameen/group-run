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
import pytest_asyncio
from app.api.app import create_app
from app.organization import service as org_service
from app.work_items import service as work_items_service
from app.work_items.models import OWNER_AGENT_ID, STATUS_NEW
from app.work_items.service import NoOrganizationError, UnknownOrganizationError
from fastapi.testclient import TestClient

pytestmark = pytest.mark.asyncio


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work item DBs.

    No context manager, matching the existing API test pattern — the app
    lifespan (checkpointer/threads.sqlite) is never started.
    """
    return TestClient(create_app())


@pytest_asyncio.fixture
async def organization(org_db):
    """A default-structure organization to submit work items into."""
    return await org_service.create_organization("Acme Robotics")


class TestSubmitWorkItemService:
    """AC #1 — service-level create semantics."""

    @pytest.mark.asyncio
    async def test_create_defaults(self, organization, work_item_db):
        item = await work_items_service.submit_work_item(
            "Automated inventory scanner", org_id=organization.org_id
        )
        assert item.work_item_id
        assert item.org_id == organization.org_id
        assert item.title == "Automated inventory scanner"
        assert item.status == STATUS_NEW
        assert item.owner_agent_id == OWNER_AGENT_ID

    @pytest.mark.asyncio
    async def test_create_requires_an_organization(self, org_db, work_item_db):
        with pytest.raises(NoOrganizationError):
            await work_items_service.submit_work_item("Orphan idea")

    @pytest.mark.asyncio
    async def test_create_blank_title_rejected(self, organization, work_item_db):
        with pytest.raises(ValueError):
            await work_items_service.submit_work_item("   ")

    @pytest.mark.asyncio
    async def test_create_unknown_organization(self, work_item_db):
        with pytest.raises(UnknownOrganizationError):
            await work_items_service.submit_work_item("Ghost org item", org_id="does-not-exist")


class TestRouting:
    """AC #2 + AC #3 — deterministic routing with persisted provenance."""

    @pytest.mark.asyncio
    async def test_default_routing_low_confidence(self, organization, work_item_db):
        item = await work_items_service.submit_work_item(
            "New concept", org_id=organization.org_id
        )
        assert item.department_id == "ideation"
        assert item.routing.confidence == "low"
        assert item.routing.decided_by == OWNER_AGENT_ID
        assert item.routing.decided_at
        assert "ideation" in item.routing.reasoning
        assert item.routing.alternatives == ["technology"]

    @pytest.mark.asyncio
    async def test_explicit_valid_hint_high_confidence(self, organization, work_item_db):
        item = await work_items_service.submit_work_item(
            "Refactor build pipeline",
            org_id=organization.org_id,
            department="technology",
        )
        assert item.department_id == "technology"
        assert item.routing.confidence == "high"
        assert item.routing.alternatives == ["ideation"]

    @pytest.mark.asyncio
    async def test_invalid_hint_falls_back_and_quotes_hint(self, organization, work_item_db):
        item = await work_items_service.submit_work_item(
            "Mystery", org_id=organization.org_id, department="legal"
        )
        assert item.department_id == "ideation"
        assert item.routing.confidence == "low"
        assert "legal" in item.routing.reasoning

    @pytest.mark.asyncio
    async def test_blank_hint_treated_as_missing(self, organization, work_item_db):
        item = await work_items_service.submit_work_item(
            "Whitespace hint", org_id=organization.org_id, department="   "
        )
        assert item.department_id == "ideation"
        assert item.routing.confidence == "low"
        assert "No department specified" in item.routing.reasoning

    @pytest.mark.asyncio
    async def test_decision_persists_with_item(self, organization, work_item_db):
        item = await work_items_service.submit_work_item(
            "Persistence check", org_id=organization.org_id
        )
        stored = await work_items_service.get_work_item(item.work_item_id)
        assert stored is not None
        assert stored.routing.model_dump() == item.routing.model_dump()
        assert stored.department_id == item.department_id


class TestWorkItemListing:
    """AC #4 (data side) — ordering, filtering, missing items."""

    @pytest.mark.asyncio
    async def test_list_newest_first_and_filter(self, organization, org_db, work_item_db):
        other_org = await org_service.create_organization("Second Org")
        await work_items_service.submit_work_item("A", org_id=organization.org_id)
        await work_items_service.submit_work_item("B", org_id=organization.org_id)
        await work_items_service.submit_work_item("C", org_id=other_org.org_id)

        org_items = await work_items_service.list_work_items(organization.org_id)
        assert [item.title for item in org_items] == ["B", "A"]

        all_items = await work_items_service.list_work_items()
        assert [item.title for item in all_items] == ["C", "B", "A"]

    @pytest.mark.asyncio
    async def test_missing_item_returns_none(self, work_item_db):
        assert await work_items_service.get_work_item("nope") is None


class TestTestingResetRoute:
    """Prerequisite for fresh state isolation: POST /api/testing/reset clears work items and orgs."""

    @pytest.mark.asyncio
    async def test_reset_route_clears_organizations_and_work_items(self, client, organization):
        # Seed work item plus a lifecycle event
        item = await work_items_service.submit_work_item(
            "Item to be reset", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(item.work_item_id, "ideation")

        # Verify items, org, and lifecycle events exist
        assert client.get("/api/organizations").json()["count"] > 0
        assert client.get("/api/work-items").json()["count"] > 0
        from app.work_items import repository as work_items_repository

        assert len(await work_items_repository.list_lifecycle_events(item.work_item_id)) == 1

        # Call reset route
        reset_res = client.post("/api/testing/reset")
        assert reset_res.status_code == 200

        # Assert work items, orgs, and lifecycle events are empty
        assert client.get("/api/organizations").json()["count"] == 0
        assert client.get("/api/work-items").json()["count"] == 0
        assert len(await work_items_repository.list_lifecycle_events(item.work_item_id)) == 0


class TestWorkItemsApi:
    """AC #1 + AC #4 — the /api/work-items endpoints."""

    @pytest.mark.asyncio
    async def test_post_creates_work_item(self, client, organization):
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

    @pytest.mark.asyncio
    async def test_post_blank_title_400(self, client, organization):
        response = client.post(
            "/api/work-items",
            json={"title": "   ", "org_id": organization.org_id},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_post_overlong_title_400(self, client, organization):
        response = client.post(
            "/api/work-items", json={"title": "x" * 201, "org_id": organization.org_id}
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_post_unknown_org_404(self, client):
        response = client.post(
            "/api/work-items", json={"title": "T", "org_id": "nope"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_post_without_organization_404(self, client):
        response = client.post("/api/work-items", json={"title": "T"})
        assert response.status_code == 404
        assert "organization" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_list_and_get(self, client, organization):
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

    @pytest.mark.asyncio
    async def test_list_without_org_lists_all(self, client, organization, org_db):
        other_org = await org_service.create_organization("Other Org")
        client.post("/api/work-items", json={"title": "A", "org_id": organization.org_id})
        client.post("/api/work-items", json={"title": "B", "org_id": other_org.org_id})
        listing = client.get("/api/work-items")
        assert listing.status_code == 200
        assert listing.json()["count"] == 2

    @pytest.mark.asyncio
    async def test_list_unknown_org_404(self, client):
        response = client.get("/api/work-items", params={"org_id": "nope"})
        assert response.status_code == 404


class TestSubmitWorkItemTool:
    """AC #1 (chat) — the tool confirms in chat and never raises."""

    def test_tool_is_exposed_and_named(self):
        from app.work_items.tools import DOMAIN_TOOLS

        assert "submit_work_item" in [tool.name for tool in DOMAIN_TOOLS]
        assert "transition_work_item" in [tool.name for tool in DOMAIN_TOOLS]

    @pytest.mark.asyncio
    async def test_tool_success_confirmation(self, organization, work_item_db):
        from app.work_items.tools import submit_work_item

        result = await submit_work_item.ainvoke(
            {"title": "Chat idea", "description": "detail"}
        )
        assert "Chat idea" in result
        assert "new" in result
        assert "ideation" in result
        assert "Command Center" in result

    @pytest.mark.asyncio
    async def test_tool_without_organization_returns_error_string(self, org_db, work_item_db):
        from app.work_items.tools import submit_work_item

        result = await submit_work_item.ainvoke({"title": "Orphan"})
        assert "Could not submit" in result
        assert "organization" in result.lower()

    @pytest.mark.asyncio
    async def test_tool_blank_title_returns_error_string(self, organization, work_item_db):
        from app.work_items.tools import submit_work_item

        result = await submit_work_item.ainvoke({"title": "   "})
        assert "Could not submit" in result
        assert "title" in result.lower()


class TestLifecycleTransitions:
    """Story 8.3 AC-1/AC-2/AC-5 — service-level transition semantics."""

    async def _item(self, organization, work_item_db, **kwargs):
        return await work_items_service.submit_work_item("Lifecycle item", org_id=organization.org_id, **kwargs)

    @pytest.mark.asyncio
    async def test_forward_same_department(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        updated, event = await work_items_service.transition_work_item(item.work_item_id, "ideation")
        assert updated.status == "ideation"
        assert updated.department_id == "ideation"
        assert event.event_type == "transition"
        assert event.from_status == "new"
        assert event.to_status == "ideation"
        assert event.decided_by == OWNER_AGENT_ID
        assert event.confidence == "high"
        assert event.decided_at
        assert event.reasoning
        assert event.alternatives == [
            "product_definition", "development", "testing", "deployment", "monitoring",
        ]

    @pytest.mark.asyncio
    async def test_cross_department_handoff_forces_cos(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        await work_items_service.transition_work_item(item.work_item_id, "product_definition")
        updated, event = await work_items_service.transition_work_item(
            item.work_item_id, "development", decided_by="some_agent"
        )
        assert updated.status == "development"
        assert updated.department_id == "technology"
        assert event.event_type == "handoff"
        assert event.from_department == "ideation"
        assert event.to_department == "technology"
        assert event.decided_by == OWNER_AGENT_ID
        assert event.confidence == "high"
        assert "ideation" in event.reasoning and "technology" in event.reasoning

    @pytest.mark.asyncio
    async def test_forward_skip_allowed(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        updated, event = await work_items_service.transition_work_item(item.work_item_id, "development")
        assert updated.status == "development"
        assert updated.department_id == "technology"
        assert event.event_type == "handoff"

    @pytest.mark.asyncio
    async def test_backward_transition_rejected(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        await work_items_service.transition_work_item(item.work_item_id, "development")
        with pytest.raises(work_items_service.InvalidTransitionError) as excinfo:
            await work_items_service.transition_work_item(item.work_item_id, "ideation")
        assert "development" in str(excinfo.value)
        assert "ideation" in str(excinfo.value)
        # No event written for the rejected transition.
        assert len(await work_items_service.get_lifecycle_history(item.work_item_id)) == 2

    @pytest.mark.asyncio
    async def test_no_op_transition_rejected(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        with pytest.raises(work_items_service.InvalidTransitionError):
            await work_items_service.transition_work_item(item.work_item_id, "new")

    @pytest.mark.asyncio
    async def test_invalid_status_rejected(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        with pytest.raises(ValueError) as excinfo:
            await work_items_service.transition_work_item(item.work_item_id, "shipped")
        assert "shipped" in str(excinfo.value)
        assert "monitoring" in str(excinfo.value)

    @pytest.mark.asyncio
    async def test_unknown_item_rejected(self, work_item_db):
        with pytest.raises(work_items_service.UnknownWorkItemError):
            await work_items_service.transition_work_item("nope", "ideation")

    @pytest.mark.asyncio
    async def test_non_cos_decider_low_confidence(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        _, event = await work_items_service.transition_work_item(
            item.work_item_id, "ideation", decided_by="some_agent"
        )
        assert event.decided_by == "some_agent"
        assert event.confidence == "low"

    @pytest.mark.asyncio
    async def test_custom_reasoning_preserved(self, organization, work_item_db):
        item = await self._item(organization, work_item_db)
        _, event = await work_items_service.transition_work_item(
            item.work_item_id, "ideation", reasoning="Phase finished."
        )
        assert event.reasoning == "Phase finished."

    @pytest.mark.asyncio
    async def test_update_work_item_status_persists(self, organization, work_item_db):
        from app.work_items.lifecycle_repository import update_work_item_status

        item = await self._item(organization, work_item_db)
        await update_work_item_status(item.work_item_id, "development", "technology", "2025-01-01T00:00:00Z")

        fetched = await work_items_service.get_work_item(item.work_item_id)
        assert fetched is not None
        assert fetched.status == "development"
        assert fetched.department_id == "technology"
        assert fetched.updated_at == "2025-01-01T00:00:00Z"


class TestLifecycleHistory:
    """Story 8.3 AC-3 — full history oldest first, starting with creation."""

    @pytest.mark.asyncio
    async def test_created_event_synthesized_from_routing(self, organization, work_item_db):
        item = await work_items_service.submit_work_item("History item", org_id=organization.org_id)
        events = await work_items_service.get_lifecycle_history(item.work_item_id)
        assert len(events) == 1
        created = events[0]
        assert created.event_type == "created"
        assert created.from_status == ""
        assert created.to_status == "new"
        assert created.to_department == "ideation"
        assert created.decided_by == OWNER_AGENT_ID
        assert created.decided_at == item.created_at
        assert created.confidence == "low"

    @pytest.mark.asyncio
    async def test_history_ordering_and_provenance(self, organization, work_item_db):
        item = await work_items_service.submit_work_item("Ordered item", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        await work_items_service.transition_work_item(item.work_item_id, "development")
        await work_items_service.transition_work_item(item.work_item_id, "monitoring")
        events = await work_items_service.get_lifecycle_history(item.work_item_id)
        assert [event.event_type for event in events] == [
            "created", "transition", "handoff", "transition",
        ]
        assert [event.to_status for event in events] == [
            "new", "ideation", "development", "monitoring",
        ]
        assert all(event.work_item_id == item.work_item_id for event in events)

    @pytest.mark.asyncio
    async def test_unknown_item_rejected(self, work_item_db):
        with pytest.raises(work_items_service.UnknownWorkItemError):
            await work_items_service.get_lifecycle_history("nope")


class TestLifecycleApi:
    """Story 8.3 AC-1/AC-3/AC-5 — API error mapping and envelopes."""

    @pytest.mark.asyncio
    async def test_post_transition_201(self, client, organization):
        created = client.post("/api/work-items", json={"title": "API item", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]
        response = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "ideation"})
        assert response.status_code == 201
        body = response.json()
        assert body["work_item"]["status"] == "ideation"
        assert body["event"]["event_type"] == "transition"
        assert body["event"]["to_status"] == "ideation"

    @pytest.mark.asyncio
    async def test_post_transition_handoff_updates_department(self, client, organization):
        created = client.post("/api/work-items", json={"title": "Handoff item", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]
        response = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "development"})
        assert response.status_code == 201
        body = response.json()
        assert body["work_item"]["department_id"] == "technology"
        assert body["event"]["event_type"] == "handoff"
        assert body["event"]["decided_by"] == "chief_of_staff"

    @pytest.mark.asyncio
    async def test_transition_status_codes_for_invalid_transition_and_value_error(self, client, organization):
        """Assert InvalidTransitionError returns HTTP 409 and generic ValueError returns HTTP 400."""
        created = client.post("/api/work-items", json={"title": "Transition Test", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]

        # Generic ValueError (invalid status value) -> HTTP 400
        bad_val_res = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "shipped"})
        assert bad_val_res.status_code == 400

        # InvalidTransitionError (no-op transition) -> HTTP 409
        invalid_trans_res = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "new"})
        assert invalid_trans_res.status_code == 409

    @pytest.mark.asyncio
    async def test_post_transition_invalid_status_400(self, client, organization):
        created = client.post("/api/work-items", json={"title": "Bad status", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]
        response = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "shipped"})
        assert response.status_code == 400
        assert "shipped" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_post_transition_backward_409(self, client, organization):
        created = client.post("/api/work-items", json={"title": "Backward", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]
        client.post(f"/api/work-items/{item_id}/transitions", json={"status": "development"})
        response = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "ideation"})
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_post_transition_no_op_409(self, client, organization):
        created = client.post("/api/work-items", json={"title": "No-op", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]
        response = client.post(f"/api/work-items/{item_id}/transitions", json={"status": "new"})
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_post_transition_unknown_item_404(self, client, organization, org_db):
        response = client.post("/api/work-items/nope/transitions", json={"status": "ideation"})
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_lifecycle_200(self, client, organization):
        created = client.post("/api/work-items", json={"title": "Lifecycle", "org_id": organization.org_id})
        item_id = created.json()["work_item"]["work_item_id"]
        client.post(f"/api/work-items/{item_id}/transitions", json={"status": "development"})
        response = client.get(f"/api/work-items/{item_id}/lifecycle")
        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        assert [event["event_type"] for event in body["events"]] == ["created", "handoff"]

    @pytest.mark.asyncio
    async def test_get_lifecycle_unknown_item_404(self, client, organization, org_db):
        response = client.get("/api/work-items/nope/lifecycle")
        assert response.status_code == 404


class TestTransitionWorkItemTool:
    """Story 8.3 AC-1 (chat) — the tool confirms in chat and never raises."""

    @pytest.mark.asyncio
    async def test_tool_success_confirmation(self, organization, work_item_db):
        from app.work_items.tools import transition_work_item

        item = await work_items_service.submit_work_item("Chat lifecycle", org_id=organization.org_id)
        result = await transition_work_item.ainvoke(
            {"work_item_id": item.work_item_id, "status": "ideation"}
        )
        assert "Chat lifecycle" in result
        assert "ideation" in result
        assert "ideation" in result  # department

    @pytest.mark.asyncio
    async def test_tool_handoff_note(self, organization, work_item_db):
        from app.work_items.tools import transition_work_item

        item = await work_items_service.submit_work_item("Chat handoff", org_id=organization.org_id)
        result = await transition_work_item.ainvoke(
            {"work_item_id": item.work_item_id, "status": "development"}
        )
        assert "development" in result
        assert "technology" in result
        assert "Handoff" in result

    @pytest.mark.asyncio
    async def test_tool_unknown_item_returns_error_string(self, organization, work_item_db):
        from app.work_items.tools import transition_work_item

        result = await transition_work_item.ainvoke({"work_item_id": "nope", "status": "ideation"})
        assert "Could not transition" in result

    @pytest.mark.asyncio
    async def test_tool_invalid_status_returns_error_string(self, organization, work_item_db):
        from app.work_items.tools import transition_work_item

        item = await work_items_service.submit_work_item("Chat invalid", org_id=organization.org_id)
        result = await transition_work_item.ainvoke(
            {"work_item_id": item.work_item_id, "status": "shipped"}
        )
        assert "Could not transition" in result

    @pytest.mark.asyncio
    async def test_tool_backward_returns_error_string(self, organization, work_item_db):
        from app.work_items.tools import transition_work_item

        item = await work_items_service.submit_work_item("Chat backward", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "development")
        result = await transition_work_item.ainvoke(
            {"work_item_id": item.work_item_id, "status": "ideation"}
        )
        assert "Could not transition" in result


class TestRuntimeToolWiring:
    """AC #5 — the deep agent runtime exposes submit_work_item."""

    def test_domain_tools_in_runtime(self, monkeypatch):
        # Stub deepagents and capture the kwargs create_deep_agent receives.
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
        monkeypatch.setitem(sys.modules, "langgraph.checkpoint.postgres", MagicMock())

        from unittest.mock import AsyncMock

        import app.services.thread_manager as tm

        monkeypatch.setattr(tm, "get_pg_checkpointer", AsyncMock(return_value=MagicMock()))

        from app.agent.runtime import get_deep_agent_runtime
        from app.config import settings

        original_model = settings.deepagents_model
        settings.deepagents_model = "openai:test-model"
        try:
            import app.agent.runtime as runtime_mod

            monkeypatch.setattr(runtime_mod, "_load_mcp_tools", list)
            get_deep_agent_runtime()
        finally:
            settings.deepagents_model = original_model

        tool_names = [
            getattr(tool, "name", None) for tool in captured_kwargs.get("tools", [])
        ]
        assert "submit_work_item" in tool_names


class TestConcurrentTransitions:
    """AC: Concurrency tests firing simultaneous transitions."""

    @pytest.mark.asyncio
    async def test_simultaneous_identical_transitions(self, organization, work_item_db):
        """Firing two simultaneous identical transitions on a work item guarantees exactly one succeeds."""
        import asyncio

        item = await work_items_service.submit_work_item(
            "Concurrent transition item", org_id=organization.org_id
        )

        res1, res2 = await asyncio.gather(
            work_items_service.transition_work_item(item.work_item_id, "ideation"),
            work_items_service.transition_work_item(item.work_item_id, "ideation"),
            return_exceptions=True,
        )

        results = [r for r in (res1, res2) if not isinstance(r, Exception)]
        errors = [r for r in (res1, res2) if isinstance(r, Exception)]

        assert len(results) == 1
        assert len(errors) == 1
        assert isinstance(errors[0], work_items_service.InvalidTransitionError)

        # Verify lifecycle history is consistent and clean (created + 1 transition)
        history = await work_items_service.get_lifecycle_history(item.work_item_id)
        assert len(history) == 2
        assert history[1].to_status == "ideation"

    @pytest.mark.asyncio
    async def test_simultaneous_conflicting_transitions(self, organization, work_item_db):
        """Firing two simultaneous transitions to different phases executes atomically without state corruption."""
        import asyncio

        item = await work_items_service.submit_work_item(
            "Conflicting transitions item", org_id=organization.org_id
        )

        res1, res2 = await asyncio.gather(
            work_items_service.transition_work_item(item.work_item_id, "ideation"),
            work_items_service.transition_work_item(item.work_item_id, "development"),
            return_exceptions=True,
        )

        results = [r for r in (res1, res2) if not isinstance(r, Exception)]

        # Either both succeed sequentially (new -> ideation -> development) or ideation is skipped/rejected
        # Total lifecycle events recorded should match the number of successful transitions + created
        history = await work_items_service.get_lifecycle_history(item.work_item_id)
        assert len(history) == len(results) + 1
        updated = await work_items_service.get_work_item(item.work_item_id)
        assert updated.status == history[-1].to_status
