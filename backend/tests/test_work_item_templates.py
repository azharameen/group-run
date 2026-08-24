"""Tests for Story 9.3 — workflow template capture and replay.

Covers acceptance criteria:
- AC #1: Save captures phases + departments for a mid-lifecycle item
- AC #2: Save rejects 'new' phase items (no captured workflow yet)
- AC #3: Replay creates item and auto-advances through saved phases
- AC #4: Each phase transition records lifecycle event in audit trail
- AC #5: Template metadata (usage_count, last_used_at) is updated
- API shape: 201/400/404/500 error mapping, snake_case keys
"""

import json

import pytest
from app.api.app import create_app
from app.organization import service as org_service
from app.work_items import service as work_items_service
from app.work_items import templates as templates_service
from app.work_items.models import OWNER_AGENT_ID, STATUS_NEW
from app.work_items.service import UnknownWorkItemError
from fastapi.testclient import TestClient


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory DBs."""
    return TestClient(create_app())


@pytest.fixture
async def organization(org_db):
    """A default-structure organization."""
    return await org_service.create_organization("Acme Robotics")


class TestTemplateSaveService:
    """AC #1, AC #2 — save_template service-level semantics."""

    @pytest.mark.asyncio
    async def test_save_mid_lifecycle_item(self, organization):
        """AC #1: Save captures phases + departments for mid-lifecycle item."""
        item = await work_items_service.submit_work_item(
            "Build inventory system", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(
            item.work_item_id, "ideation"
        )
        await work_items_service.transition_work_item(
            item.work_item_id, "product_definition"
        )
        await work_items_service.transition_work_item(
            item.work_item_id, "development"
        )

        template = await templates_service.save_template(item.work_item_id, "Build workflow")
        assert template.template_id
        assert template.org_id == organization.org_id
        assert template.name == "Build workflow"
        assert template.source_work_item_id == item.work_item_id
        assert template.phases == [
            "new",
            "ideation",
            "product_definition",
            "development",
        ]
        assert template.departments == [
            "ideation",
            "ideation",
            "ideation",
            "technology",
        ]
        assert template.usage_count == 0
        assert template.last_used_at is None

    @pytest.mark.asyncio
    async def test_save_new_phase_item_rejected(self, organization):
        """AC #2: Save rejects 'new' phase items."""
        item = await work_items_service.submit_work_item(
            "Concept", org_id=organization.org_id
        )
        with pytest.raises(ValueError) as exc_info:
            await templates_service.save_template(item.work_item_id, "Concept template")
        assert "no captured workflow yet" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_save_unknown_item_raises(self):
        """404 for unknown item."""
        with pytest.raises(UnknownWorkItemError) as exc_info:
            await templates_service.save_template("does-not-exist", "Phantom template")
        assert "not found" in str(exc_info.value)


class TestTemplateReplayService:
    """AC #3, AC #4, AC #5 — replay_template service-level semantics."""

    @pytest.mark.asyncio
    async def test_replay_creates_and_advances_through_phases(
        self, organization
    ):
        """AC #3, AC #4: Replay creates item and auto-advances through phases."""
        source_item = await work_items_service.submit_work_item(
            "Build system", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(
            source_item.work_item_id, "ideation"
        )
        await work_items_service.transition_work_item(
            source_item.work_item_id, "product_definition"
        )
        await work_items_service.transition_work_item(
            source_item.work_item_id, "development"
        )

        template = await templates_service.save_template(
            source_item.work_item_id, "Build workflow"
        )

        new_item, events = await templates_service.replay_template(
            template.template_id, "Replay: Build another", "New description"
        )

        assert new_item.work_item_id != source_item.work_item_id
        assert new_item.title == "Replay: Build another"
        assert new_item.org_id == organization.org_id
        assert new_item.template_id == template.template_id
        assert new_item.source == f"template:{template.template_id}"

        assert new_item.status == "development"
        assert new_item.department_id == "technology"

        assert len(events) == 3
        assert events[0].from_status == "new"
        assert events[0].to_status == "ideation"
        assert events[1].from_status == "ideation"
        assert events[1].to_status == "product_definition"
        assert events[2].from_status == "product_definition"
        assert events[2].to_status == "development"

        assert "Replayed template" in events[0].reasoning
        assert template.name in events[0].reasoning

    @pytest.mark.asyncio
    async def test_replay_terminal_phase(self, organization):
        """Terminal phase (monitoring) is handled correctly."""
        source_item = await work_items_service.submit_work_item(
            "Monitored system", org_id=organization.org_id
        )
        for phase in [
            "ideation",
            "product_definition",
            "development",
            "testing",
            "deployment",
            "monitoring",
        ]:
            await work_items_service.transition_work_item(source_item.work_item_id, phase)

        template = await templates_service.save_template(
            source_item.work_item_id, "Full lifecycle"
        )

        new_item, events = await templates_service.replay_template(
            template.template_id, "Monitored replay", ""
        )

        assert new_item.status == "monitoring"
        assert len(events) == 6

    @pytest.mark.asyncio
    async def test_replay_updates_usage_metadata(self, organization):
        """AC #5: usage_count and last_used_at are updated."""
        source_item = await work_items_service.submit_work_item(
            "Build", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(source_item.work_item_id, "ideation")

        template = await templates_service.save_template(
            source_item.work_item_id, "Build template"
        )
        assert template.usage_count == 0
        assert template.last_used_at is None

        await templates_service.replay_template(template.template_id, "Replay 1", "")

        refreshed_list = await templates_service.list_templates(organization.org_id)
        refreshed = refreshed_list[0]
        assert refreshed.usage_count == 1
        assert refreshed.last_used_at is not None

        await templates_service.replay_template(template.template_id, "Replay 2", "")
        refreshed_list = await templates_service.list_templates(organization.org_id)
        refreshed = refreshed_list[0]
        assert refreshed.usage_count == 2

    @pytest.mark.asyncio
    async def test_replay_unknown_template_raises(self):
        """ValueError for unknown template."""
        with pytest.raises(ValueError) as exc_info:
            await templates_service.replay_template("does-not-exist", "New item", "")
        assert "not found" in str(exc_info.value)


class TestTemplateListService:
    """list_templates service-level semantics."""

    @pytest.mark.asyncio
    async def test_list_templates_for_org(self, organization):
        """List returns all templates for the org, newest first."""
        item1 = await work_items_service.submit_work_item(
            "Item 1", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(item1.work_item_id, "ideation")
        template1 = await templates_service.save_template(item1.work_item_id, "Template 1")

        item2 = await work_items_service.submit_work_item(
            "Item 2", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(item2.work_item_id, "ideation")
        template2 = await templates_service.save_template(item2.work_item_id, "Template 2")

        templates = await templates_service.list_templates(organization.org_id)
        assert len(templates) == 2
        assert templates[0].template_id == template2.template_id
        assert templates[1].template_id == template1.template_id

    @pytest.mark.asyncio
    async def test_list_templates_empty(self, organization):
        """Empty list when no templates."""
        templates = await templates_service.list_templates(organization.org_id)
        assert templates == []


class TestTemplateSaveAPI:
    """API-level POST /work-items/{id}/template."""

    @pytest.mark.asyncio
    async def test_save_returns_201_with_template(self, client, organization):
        """201 with template object."""
        item = await work_items_service.submit_work_item(
            "Build", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(item.work_item_id, "ideation")

        response = client.post(
            f"/api/work-items/{item.work_item_id}/template",
            json={"name": "Build template"},
        )
        assert response.status_code == 201
        body = response.json()
        assert "template" in body
        template = body["template"]
        assert template["template_id"]
        assert template["name"] == "Build template"
        assert template["phases"] == ["new", "ideation"]
        assert template["usage_count"] == 0

    @pytest.mark.asyncio
    async def test_save_blank_name_returns_400(self, client, organization):
        """400 for blank name."""
        item = await work_items_service.submit_work_item(
            "Build", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(item.work_item_id, "ideation")

        response = client.post(
            f"/api/work-items/{item.work_item_id}/template",
            json={"name": "   "},
        )
        assert response.status_code == 400
        assert "non-empty" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_save_new_phase_returns_400(self, client, organization):
        """400 for new phase item."""
        item = await work_items_service.submit_work_item(
            "Concept", org_id=organization.org_id
        )

        response = client.post(
            f"/api/work-items/{item.work_item_id}/template",
            json={"name": "Concept template"},
        )
        assert response.status_code == 400
        assert "no captured workflow" in response.json()["detail"]

    def test_save_unknown_item_returns_404(self, client):
        """404 for unknown item."""
        response = client.post(
            "/api/work-items/does-not-exist/template",
            json={"name": "Phantom"},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]


class TestTemplateListAPI:
    """API-level GET /work-items/templates."""

    @pytest.mark.asyncio
    async def test_list_returns_200_with_templates(self, client, organization):
        """200 with templates array."""
        item = await work_items_service.submit_work_item(
            "Build", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        await templates_service.save_template(item.work_item_id, "Template")

        response = client.get(
            f"/api/work-items/templates?org_id={organization.org_id}"
        )
        assert response.status_code == 200
        body = response.json()
        assert "templates" in body
        assert "count" in body
        assert body["count"] == 1
        assert body["templates"][0]["name"] == "Template"

    def test_list_missing_org_id_returns_400(self, client):
        """400 when org_id is missing."""
        response = client.get("/api/work-items/templates")
        assert response.status_code == 400
        assert "required" in response.json()["detail"]

    def test_list_unknown_org_returns_404(self, client):
        """404 for unknown org."""
        response = client.get("/api/work-items/templates?org_id=does-not-exist")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]


class TestTemplateReplayAPI:
    """API-level POST /work-items/templates/{id}/replay."""

    @pytest.mark.asyncio
    async def test_replay_returns_201_with_item_and_events(
        self, client, organization
    ):
        """201 with work_item and events array."""
        source_item = await work_items_service.submit_work_item(
            "Build", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(source_item.work_item_id, "ideation")
        template = await templates_service.save_template(
            source_item.work_item_id, "Build template"
        )

        response = client.post(
            f"/api/work-items/templates/{template.template_id}/replay",
            json={"title": "Replay: Build", "description": "New run"},
        )
        assert response.status_code == 201
        body = response.json()
        assert "work_item" in body
        assert "events" in body
        assert "count" in body
        assert body["count"] == 1
        assert body["work_item"]["status"] == "ideation"
        assert body["work_item"]["template_id"] == template.template_id

    @pytest.mark.asyncio
    async def test_replay_blank_title_returns_400(self, client, organization):
        """400 for blank title."""
        source_item = await work_items_service.submit_work_item(
            "Build", org_id=organization.org_id
        )
        await work_items_service.transition_work_item(source_item.work_item_id, "ideation")
        template = await templates_service.save_template(
            source_item.work_item_id, "Template"
        )

        response = client.post(
            f"/api/work-items/templates/{template.template_id}/replay",
            json={"title": "   ", "description": ""},
        )
        assert response.status_code == 400
        assert "non-empty" in response.json()["detail"]

    def test_replay_unknown_template_returns_404(self, client):
        """404 for unknown template."""
        response = client.post(
            "/api/work-items/templates/does-not-exist/replay",
            json={"title": "New item", "description": ""},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]
