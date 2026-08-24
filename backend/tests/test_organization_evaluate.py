"""Tests for Story 9.2 — reassign idle agents and escalate blocked work.

Covers the I/O matrix:
- REASSIGN: idle agent picked, owner/status updated, audit row written
- NO_IDLE_CAPACITY: no reassignment, escalation alert with capacity reason
- ESCALATE: threshold boundary with backdated updated_at
- IDEMPOTENT: second run produces no new actions or alerts
- UNKNOWN_ORG: 404
- snake_case API contract
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.api.app import create_app
from app.config import settings
from app.organization import evaluate as org_evaluate
from app.organization import repository as org_repo
from app.organization import service as org_service
from app.work_items import repository as work_items_repo
from fastapi.testclient import TestClient


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work-item DBs."""
    return TestClient(create_app())


async def _create_org() -> str:
    """Create a default organization and return its id."""
    org = await org_service.create_organization("Acme")
    return org.org_id


async def _insert_work_item(
    org_id: str,
    department_id: str,
    status: str = "new",
    owner_agent_id: str = "chief_of_staff",
    updated_at: str | None = None,
) -> str:
    """Insert a minimal work item routed to a department; return its id."""
    work_item_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await work_items_repo.insert_work_item(
        {
            "work_item_id": work_item_id,
            "org_id": org_id,
            "title": f"Item for {department_id}",
            "description": "",
            "status": status,
            "owner_agent_id": owner_agent_id,
            "source": "test",
            "created_at": now,
            "updated_at": updated_at or now,
        },
        {
            "department_id": department_id,
            "decided_by": "chief_of_staff",
            "decided_at": now,
            "confidence": "high",
            "reasoning": "test routing",
            "alternatives": [],
        },
    )
    return work_item_id


async def _set_agent_status(org_id: str, agent_id: str, status: str) -> None:
    """Set an agent's stored status directly (test seeding)."""
    assert await org_repo.update_agent_status(org_id, agent_id, status)


async def _events(work_item_id: str) -> list:
    return await work_items_repo.list_lifecycle_events(work_item_id)


class TestEvaluateService:
    """Service-level reassignment and escalation behavior."""

    @pytest.mark.asyncio
    async def test_reassign_picks_idle_agent_and_writes_audit(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        work_item_id = await _insert_work_item(org_id, "ideation", "new")

        result = await org_evaluate.evaluate_organization(org_id)

        assert result is not None
        assert len(result.actions) == 1
        action = result.actions[0]
        # First idle agent in ideation by agent_id order.
        assert action.to_agent_id == "chief_ideation"
        assert action.from_agent_id == "chief_of_staff"
        assert action.department_id == "ideation"
        assert result.alerts == []
        item_rows = await work_items_repo.get_work_item_rows(work_item_id)
        assert item_rows is not None
        assert item_rows["item"]["owner_agent_id"] == "chief_ideation"
        org_rows = await org_repo.get_organization_rows(org_id)
        assert org_rows is not None
        status = next(a["status"] for a in org_rows["agents"] if a["agent_id"] == "chief_ideation")
        assert status == "active"
        events = await _events(work_item_id)
        assert len(events) == 1
        assert events[0]["event_type"] == "reassignment"
        assert events[0]["reasoning"] == action.reason

    @pytest.mark.asyncio
    async def test_reassigned_item_still_escalates_when_stuck(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        backdated = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
        work_item_id = await _insert_work_item(
            org_id, "ideation", "new", updated_at=backdated
        )

        result = await org_evaluate.evaluate_organization(org_id)

        # Reassignment and escalation are independent: both must happen.
        assert result is not None
        assert len(result.actions) == 1
        assert len(result.alerts) == 1
        assert result.alerts[0].work_item_id == work_item_id
        assert result.alerts[0].phase == "new"
        events = await _events(work_item_id)
        assert {event["event_type"] for event in events} == {
            "reassignment",
            "escalation",
        }

    @pytest.mark.asyncio
    async def test_no_reassignment_without_idle_capacity(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        # Mark every ideation agent active so no idle capacity remains.
        org_rows = await org_repo.get_organization_rows(org_id)
        assert org_rows is not None
        for agent in org_rows["agents"]:
            if agent["department_id"] == "ideation":
                await _set_agent_status(org_id, agent["agent_id"], "active")
        work_item_id = await _insert_work_item(org_id, "ideation", "new")

        result = await org_evaluate.evaluate_organization(org_id)

        assert result is not None
        assert result.actions == []
        assert result.alerts == []
        item_rows = await work_items_repo.get_work_item_rows(work_item_id)
        assert item_rows is not None
        assert item_rows["item"]["owner_agent_id"] == "chief_of_staff"

    @pytest.mark.asyncio
    async def test_escalation_at_threshold_boundary(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        org_rows = await org_repo.get_organization_rows(org_id)
        assert org_rows is not None
        for agent in org_rows["agents"]:
            if agent["department_id"] == "technology":
                await _set_agent_status(org_id, agent["agent_id"], "active")
        # 25 hours old — beyond the threshold.
        backdated = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
        work_item_id = await _insert_work_item(
            org_id, "technology", "development", updated_at=backdated
        )

        result = await org_evaluate.evaluate_organization(org_id)

        assert result is not None
        assert result.actions == []
        assert len(result.alerts) == 1
        alert = result.alerts[0]
        assert alert.work_item_id == work_item_id
        assert alert.phase == "development"
        assert "no idle capacity" in alert.reason.lower()
        assert await work_items_repo.has_org_alert(org_id, work_item_id, "development")
        events = await _events(work_item_id)
        assert len(events) == 1
        assert events[0]["event_type"] == "escalation"

    @pytest.mark.asyncio
    async def test_no_escalation_at_or_below_threshold(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        org_rows = await org_repo.get_organization_rows(org_id)
        assert org_rows is not None
        for agent in org_rows["agents"]:
            if agent["department_id"] == "technology":
                await _set_agent_status(org_id, agent["agent_id"], "active")
        # 23 hours old — under the threshold.
        backdated = (datetime.now(UTC) - timedelta(hours=23)).isoformat()
        await _insert_work_item(org_id, "technology", "development", updated_at=backdated)

        result = await org_evaluate.evaluate_organization(org_id)

        assert result is not None
        assert result.actions == []
        assert result.alerts == []

    @pytest.mark.asyncio
    async def test_second_run_is_idempotent(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        org_rows = await org_repo.get_organization_rows(org_id)
        assert org_rows is not None
        for agent in org_rows["agents"]:
            if agent["department_id"] == "technology":
                await _set_agent_status(org_id, agent["agent_id"], "active")
        backdated = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
        work_item_id = await _insert_work_item(
            org_id, "technology", "development", updated_at=backdated
        )

        first = await org_evaluate.evaluate_organization(org_id)
        second = await org_evaluate.evaluate_organization(org_id)

        assert first is not None and len(first.alerts) == 1
        assert second is not None
        assert second.actions == []
        assert second.alerts == []
        assert len(await _events(work_item_id)) == 1

    @pytest.mark.asyncio
    async def test_org_level_cos_never_picked_as_owner(self, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        await _set_agent_status(org_id, "chief_of_staff", "idle")
        work_item_id = await _insert_work_item(org_id, "ideation", "new")

        result = await org_evaluate.evaluate_organization(org_id)

        assert result is not None
        assert len(result.actions) == 1
        assert result.actions[0].to_agent_id != "chief_of_staff"
        item_rows = await work_items_repo.get_work_item_rows(work_item_id)
        assert item_rows is not None
        assert item_rows["item"]["owner_agent_id"] != "chief_of_staff"

    @pytest.mark.asyncio
    async def test_unknown_org_returns_none(self):
        assert await org_evaluate.evaluate_organization("does-not-exist") is None


class TestEvaluateAPI:
    """API contract for POST /evaluate and GET /alerts."""

    @pytest.mark.asyncio
    async def test_evaluate_201_shape_and_snake_case(self, client, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        await _insert_work_item(org_id, "ideation", "new")

        response = client.post(f"/api/organizations/{org_id}/evaluate")

        assert response.status_code == 201
        evaluation = response.json()["evaluation"]
        assert set(evaluation) == {"actions", "alerts"}
        action = evaluation["actions"][0]
        assert set(action) == {
            "work_item_id",
            "from_agent_id",
            "to_agent_id",
            "department_id",
            "reason",
        }

    def test_evaluate_unknown_org_returns_404(self, client):
        response = client.post("/api/organizations/does-not-exist/evaluate")
        assert response.status_code == 404
        assert response.json()["detail"] == "Organization does-not-exist not found"

    @pytest.mark.asyncio
    async def test_alerts_endpoint_lists_raised_alerts(self, client, monkeypatch):
        monkeypatch.setattr(settings, "blocked_phase_threshold_hours", 24)
        org_id = await _create_org()
        org_rows = await org_repo.get_organization_rows(org_id)
        assert org_rows is not None
        for agent in org_rows["agents"]:
            if agent["department_id"] == "technology":
                await _set_agent_status(org_id, agent["agent_id"], "active")
        backdated = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
        work_item_id = await _insert_work_item(
            org_id, "technology", "development", updated_at=backdated
        )
        client.post(f"/api/organizations/{org_id}/evaluate")

        response = client.get(f"/api/organizations/{org_id}/alerts")

        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 1
        alert = body["alerts"][0]
        assert set(alert) == {
            "alert_id",
            "org_id",
            "work_item_id",
            "phase",
            "reason",
            "raised_at",
        }
        assert alert["work_item_id"] == work_item_id
        assert alert["phase"] == "development"

    def test_alerts_unknown_org_returns_404(self, client):
        response = client.get("/api/organizations/does-not-exist/alerts")
        assert response.status_code == 404
