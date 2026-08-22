"""Tests for Story 9.1 — organization health and team capacity.

Covers the I/O matrix:
- HAPPY_PATH: per-team capacity + workload from open work items
- NO_WORK_ITEMS: every team idle with zero open items
- OVERLOADED_TEAM: threshold boundary at exactly N and N+1
- UNKNOWN_ORG: 404
- snake_case API contract
"""

import uuid
from datetime import UTC, datetime

import pytest
from app.api.app import create_app
from app.config import settings
from app.organization import health as org_health
from app.organization import service as org_service
from app.work_items import repository as work_items_repo
from fastapi.testclient import TestClient

_EXPECTED_TEAM_IDS = [
    "idea-team",
    "product-team",
    "development-team",
    "testing-team",
    "devops-team",
]


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work-item DBs."""
    return TestClient(create_app())


def _create_org() -> str:
    """Create a default organization and return its id."""
    return org_service.create_organization("Acme").org_id


def _insert_work_item(org_id: str, department_id: str, status: str = "new") -> str:
    """Insert a minimal work item routed to a department; return its id."""
    work_item_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    work_items_repo.insert_work_item(
        {
            "work_item_id": work_item_id,
            "org_id": org_id,
            "title": f"Item for {department_id}",
            "description": "",
            "status": status,
            "owner_agent_id": "chief_of_staff",
            "source": "test",
            "created_at": now,
            "updated_at": now,
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


class TestHealthService:
    """Service-level derivation of capacity and workload state."""

    def test_happy_path_counts_and_workload(self, org_db, work_item_db):
        org_id = _create_org()
        _insert_work_item(org_id, "technology", "development")
        _insert_work_item(org_id, "technology", "testing")
        _insert_work_item(org_id, "ideation", "new")

        result = org_health.get_organization_health(org_id)

        assert result is not None
        assert result.org_id == org_id
        assert result.total_open_work_items == 3
        by_team = {t.team_id: t for d in result.departments for t in d.teams}
        assert set(by_team) == set(_EXPECTED_TEAM_IDS)
        dev = by_team["development-team"]
        assert (dev.active_agents, dev.idle_agents, dev.total_agents) == (0, 3, 3)
        assert dev.open_work_items == 2
        assert dev.workload_state == "active"
        idea = by_team["idea-team"]
        assert idea.open_work_items == 1
        assert idea.workload_state == "active"
        devops = by_team["devops-team"]
        assert devops.open_work_items == 2
        assert devops.workload_state == "active"

    def test_no_work_items_all_teams_idle(self, org_db, work_item_db):
        org_id = _create_org()

        result = org_health.get_organization_health(org_id)

        assert result is not None
        assert result.total_open_work_items == 0
        for dept in result.departments:
            for team in dept.teams:
                assert team.open_work_items == 0
                assert team.workload_state == "idle"

    def test_overload_threshold_boundary(self, org_db, work_item_db, monkeypatch):
        monkeypatch.setattr(settings, "team_overload_threshold", 2)
        org_id = _create_org()
        for _ in range(2):
            _insert_work_item(org_id, "technology")

        at_threshold = org_health.get_organization_health(org_id)
        dev_at = next(
            t for d in at_threshold.departments for t in d.teams
            if t.team_id == "development-team"
        )
        assert dev_at.workload_state == "active"

        _insert_work_item(org_id, "technology")
        over_threshold = org_health.get_organization_health(org_id)
        dev_over = next(
            t for d in over_threshold.departments for t in d.teams
            if t.team_id == "development-team"
        )
        assert dev_over.open_work_items == 3
        assert dev_over.workload_state == "overloaded"

    def test_monitoring_items_not_counted_open(self, org_db, work_item_db):
        org_id = _create_org()
        _insert_work_item(org_id, "technology", "monitoring")

        result = org_health.get_organization_health(org_id)

        assert result is not None
        assert result.total_open_work_items == 0

    def test_unknown_org_returns_none(self, org_db, work_item_db):
        assert org_health.get_organization_health("does-not-exist") is None


class TestHealthAPI:
    """API contract for GET /api/organizations/{org_id}/health."""

    def test_health_200_shape_and_snake_case(self, client):
        org_id = _create_org()
        _insert_work_item(org_id, "ideation")

        response = client.get(f"/api/organizations/{org_id}/health")

        assert response.status_code == 200
        health = response.json()["health"]
        assert health["org_id"] == org_id
        assert health["total_open_work_items"] == 1
        team = health["departments"][0]["teams"][0]
        assert set(team) == {
            "team_id",
            "name",
            "department_id",
            "active_agents",
            "idle_agents",
            "total_agents",
            "open_work_items",
            "workload_state",
        }

    def test_health_unknown_org_returns_404(self, client):
        response = client.get("/api/organizations/does-not-exist/health")
        assert response.status_code == 404
