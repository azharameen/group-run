"""Tests for Story 8.1 — organization structure (model, service, repository, API).

Covers acceptance criteria:
- AC #1: create persists and returns 201 with the full default structure
- AC #2: pinned default structure (2 depts / 5 teams / 18 agents)
- AC #3: status vocabulary — CoS active, all others valid statuses
- AC #6: 404 for unknown org_id, 400 for blank/over-long names
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import SQLAlchemyError
from app.api.app import create_app
from app.organization import repository as org_repo
from app.organization import service as org_service
from app.organization.models import DEFAULT_ORG_STRUCTURE
from fastapi.testclient import TestClient

_EXPECTED_DEPARTMENT_IDS = ["ideation", "technology"]
_EXPECTED_TEAM_IDS = [
    "idea-team",
    "product-team",
    "development-team",
    "testing-team",
    "devops-team",
]
_EXPECTED_TEAM_COUNTS = (2, 5, 18)  # departments, teams, agents


@pytest.fixture
def client(org_db):
    """TestClient over the full app with an isolated in-memory org DB.

    No context manager, matching the existing API test pattern — the app
    lifespan (checkpointer/threads.sqlite) is never started.
    """
    return TestClient(create_app())


def _all_team_agents(org):
    """Flatten every agent across all teams of an org tree."""
    return [agent for dept in org.departments for team in dept.teams for agent in team.agents]


def _all_agents(org):
    """Every agent in the tree: CoS + chiefs + all team agents."""
    chiefs = [dept.chief for dept in org.departments]
    return [org.chief_of_staff] + chiefs + _all_team_agents(org)


class TestDefaultStructure:
    """AC #2 — the pinned default structure constant is complete and unique."""

    def test_pinned_totals(self):
        structure = DEFAULT_ORG_STRUCTURE
        assert len(structure["departments"]) == 2
        teams = [t for d in structure["departments"] for t in d["teams"]]
        assert len(teams) == 5
        agents = [structure["chief_of_staff"]]
        for dept in structure["departments"]:
            agents.append(dept["chief"])
            for team in dept["teams"]:
                agents.append(team["captain"])
                agents.extend(team["members"])
        assert len(agents) == 18

    def test_agent_ids_unique(self):
        structure = DEFAULT_ORG_STRUCTURE
        agents = [structure["chief_of_staff"]]
        for dept in structure["departments"]:
            agents.append(dept["chief"])
            for team in dept["teams"]:
                agents.append(team["captain"])
                agents.extend(team["members"])
        ids = {agent["agent_id"] for agent in agents}
        assert len(ids) == 18


class TestService:
    """AC #1–#3 — service-layer create/read behavior."""

    def test_create_returns_full_tree(self, org_db):
        org = org_service.create_organization("Acme", "test org")
        assert org.org_id
        assert org.name == "Acme"
        assert org.description == "test org"
        assert [d.department_id for d in org.departments] == _EXPECTED_DEPARTMENT_IDS
        assert [d.name for d in org.departments] == ["Ideation", "Technology"]
        assert [t.team_id for d in org.departments for t in d.teams] == _EXPECTED_TEAM_IDS

    def test_team_capacity_and_captain_first(self, org_db):
        org = org_service.create_organization("Acme")
        teams = [t for d in org.departments for t in d.teams]
        assert len(teams) == 5
        for team in teams:
            assert team.captain is not None
            assert team.agents[0].role == "team_captain"
            assert team.active_agents == 0
            assert team.total_agents == 3
        assert sum(len(t.agents) for t in teams) == 15

    def test_create_has_18_unique_agents(self, org_db):
        org = org_service.create_organization("Acme")
        agents = _all_agents(org)
        assert len(agents) == 18
        assert len({a.agent_id for a in agents}) == 18

    def test_status_vocabulary(self, org_db):
        org = org_service.create_organization("Acme")
        assert org.chief_of_staff.agent_id == "chief_of_staff"
        assert org.chief_of_staff.status == "active"
        for dept in org.departments:
            assert dept.status in {"active", "idle", "overloaded"}
            assert dept.chief.status in {"active", "idle", "overloaded"}
            for team in dept.teams:
                assert team.status in {"active", "idle", "overloaded"}
                assert all(a.status in {"active", "idle", "overloaded"} for a in team.agents)

    def test_get_organization_round_trip(self, org_db):
        created = org_service.create_organization("Acme", "desc")
        fetched = org_service.get_organization(created.org_id)
        assert fetched is not None
        assert fetched.model_dump() == created.model_dump()

    def test_get_unknown_returns_none(self, org_db):
        assert org_service.get_organization("does-not-exist") is None

    def test_persistence_survives_connection_reopen(self, tmp_path, monkeypatch):
        """Rows survive closing the connection and reopening the same file."""
        monkeypatch.setattr(org_repo, "STORAGE_DIR", str(tmp_path))
        org_repo._reset_organization_db()

        created = org_service.create_organization("Acme")
        org_repo._reset_organization_db()  # closes the file connection

        fetched = org_service.get_organization(created.org_id)
        assert fetched is not None
        assert fetched.name == "Acme"
        assert len(_all_agents(fetched)) == 18
        assert (tmp_path / "organizations.sqlite").exists()

        org_repo._reset_organization_db()  # release the file handle for tmp cleanup

    def test_create_rolls_back_on_mid_structure_failure(self, org_db, monkeypatch):
        """A storage failure mid-tree rolls back: no partial org remains (P1)."""

        def boom(conn, org_id, department_id, team_id, agent):
            raise SQLAlchemyError("simulated storage failure")

        monkeypatch.setattr(org_repo, "_insert_agent_row", boom)
        with pytest.raises(SQLAlchemyError):
            org_service.create_organization("Acme")
        assert org_service.list_organizations() == []

    def test_get_missing_chief_of_staff_raises_integrity_error(self, org_db):
        """An org row without its CoS row raises, not StopIteration (P2)."""
        now = datetime.now(UTC).isoformat()
        org_id = "org-incomplete"
        org_db.execute(
            "INSERT INTO organizations (org_id, name, description, created_at, updated_at)"
            " VALUES (?, 'P', '', ?, ?)",
            (org_id, now, now),
        )
        org_db.commit()
        with pytest.raises(org_service.OrganizationIntegrityError):
            org_service.get_organization(org_id)

    def test_list_organizations_shape_and_order(self, org_db):
        first = org_service.create_organization("First")
        second = org_service.create_organization("Second")
        summaries = org_service.list_organizations()
        assert {s.org_id for s in summaries} == {first.org_id, second.org_id}
        assert summaries[0].updated_at >= summaries[-1].updated_at
        for summary in summaries:
            assert (summary.department_count, summary.team_count, summary.agent_count) == (
                _EXPECTED_TEAM_COUNTS
            )


class TestOrganizationApi:
    """AC #1, #6 — API contract from Dev Notes §4."""

    def test_create_returns_201_with_tree(self, client):
        response = client.post(
            "/api/organizations", json={"name": "Acme", "description": "first org"}
        )
        assert response.status_code == 201
        org = response.json()["organization"]
        assert org["org_id"]
        assert org["name"] == "Acme"
        assert org["description"] == "first org"
        assert [d["department_id"] for d in org["departments"]] == _EXPECTED_DEPARTMENT_IDS
        assert org["chief_of_staff"]["status"] == "active"
        team_agents = [a for d in org["departments"] for t in d["teams"] for a in t["agents"]]
        assert len(team_agents) == 15

    def test_create_blank_name_returns_400(self, client):
        for name in ("", "   "):
            response = client.post("/api/organizations", json={"name": name})
            assert response.status_code == 400
            assert response.json()["detail"]

    def test_create_overlong_name_returns_400(self, client):
        response = client.post("/api/organizations", json={"name": "x" * 201})
        assert response.status_code == 400
        assert response.json()["detail"]

    def test_get_list_shape(self, client):
        created = client.post("/api/organizations", json={"name": "Acme"}).json()["organization"]
        response = client.get("/api/organizations")
        assert response.status_code == 200
        payload = response.json()
        assert set(payload) == {"organizations", "count"}
        assert payload["count"] == 1
        summary = payload["organizations"][0]
        assert summary["org_id"] == created["org_id"]
        assert (summary["department_count"], summary["team_count"], summary["agent_count"]) == (
            _EXPECTED_TEAM_COUNTS
        )

    def test_get_by_id_returns_tree(self, client):
        org_id = client.post("/api/organizations", json={"name": "Acme"}).json()["organization"][
            "org_id"
        ]
        response = client.get(f"/api/organizations/{org_id}")
        assert response.status_code == 200
        assert response.json()["organization"]["org_id"] == org_id

    def test_get_unknown_returns_404(self, client):
        response = client.get("/api/organizations/does-not-exist")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]
