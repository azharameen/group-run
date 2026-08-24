"""API tests for artifact provenance and review endpoints (Story 10.2)."""

import pytest
from app.api.app import create_app
from app.storage.artifacts import save_artifact_revision
from app.storage.idea_workspace import create_idea_folder, load_idea_yaml, save_idea_yaml
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    return TestClient(create_app())


def _make_idea(idea_id: str = "IDEA-0001") -> None:
    create_idea_folder(idea_id)
    save_idea_yaml(idea_id, "idea.yaml", {"idea_id": idea_id, "title": "Test idea"})


class TestRevisionsEndpoint:
    def test_happy_path_returns_revisions(self, client, patch_config):
        _make_idea()
        save_artifact_revision(
            idea_id="IDEA-0001",
            artifact_name="patent-claims",
            content="Claim 1",
            provenance="agent",
            agent_id="deepagents",
        )
        res = client.get("/api/ideas/IDEA-0001/revisions")
        assert res.status_code == 200
        body = res.json()
        assert body["idea_id"] == "IDEA-0001"
        assert body["count"] == 1
        revision = body["revisions"][0]
        assert revision["artifact_name"] == "patent-claims"
        assert revision["agent_id"] == "deepagents"
        assert revision["trust"] == "generated"

    def test_empty_revisions(self, client, patch_config):
        _make_idea()
        res = client.get("/api/ideas/IDEA-0001/revisions")
        assert res.status_code == 200
        assert res.json() == {"idea_id": "IDEA-0001", "revisions": [], "count": 0}

    def test_unknown_idea_404(self, client, patch_config):
        res = client.get("/api/ideas/UNKNOWN-9999/revisions")
        assert res.status_code == 404
        assert "UNKNOWN-9999" in res.json()["detail"]


class TestArtifactDiffEndpoint:
    def test_diff_available_with_two_revisions(self, client, patch_config):
        _make_idea()
        save_artifact_revision(
            idea_id="IDEA-0001",
            artifact_name="patent-claims",
            content="Line 1\nLine 2\n",
            provenance="agent",
        )
        save_artifact_revision(
            idea_id="IDEA-0001",
            artifact_name="patent-claims",
            content="Line 1\nLine 2 changed\n",
            provenance="agent",
        )
        res = client.get("/api/ideas/IDEA-0001/artifacts/patent-claims/diff")
        assert res.status_code == 200
        body = res.json()
        assert body["available"] is True
        assert body["latest"]["version"] == 2
        assert body["previous"]["version"] == 1
        assert body["content_a"] == "Line 1\nLine 2\n"
        assert body["content_b"] == "Line 1\nLine 2 changed\n"
        assert "Line 2 changed" in body["diff"]

    def test_diff_unavailable_with_single_revision(self, client, patch_config):
        _make_idea()
        save_artifact_revision(
            idea_id="IDEA-0001",
            artifact_name="patent-claims",
            content="Only one",
            provenance="agent",
        )
        res = client.get("/api/ideas/IDEA-0001/artifacts/patent-claims/diff")
        assert res.status_code == 200
        assert res.json()["available"] is False

    def test_diff_unknown_artifact_unavailable(self, client, patch_config):
        _make_idea()
        res = client.get("/api/ideas/IDEA-0001/artifacts/does-not-exist/diff")
        assert res.status_code == 200
        assert res.json()["available"] is False

    def test_diff_unknown_idea_404(self, client, patch_config):
        res = client.get("/api/ideas/UNKNOWN-9999/artifacts/patent-claims/diff")
        assert res.status_code == 404


class TestReviewEndpoint:
    def test_happy_path_persists_review(self, client, patch_config):
        _make_idea()
        res = client.post(
            "/api/ideas/IDEA-0001/review",
            json={"reviewer_role": "Inventor", "decision": "approved", "comments": "Looks good"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["idea_id"] == "IDEA-0001"
        assert body["reviewer"] == "Inventor"
        assert body["decision"] == "approved"

        idea_data = load_idea_yaml("IDEA-0001", "idea.yaml")
        review = idea_data["reviews"]["inventor"]
        assert review["status"] == "approved"
        assert review["comments"] == "Looks good"
        assert review["trust"] == "trusted"

    def test_unknown_idea_404(self, client, patch_config):
        res = client.post(
            "/api/ideas/UNKNOWN-9999/review",
            json={"reviewer_role": "Inventor", "decision": "approved"},
        )
        assert res.status_code == 404

    def test_empty_decision_422(self, client, patch_config):
        _make_idea()
        res = client.post(
            "/api/ideas/IDEA-0001/review",
            json={"reviewer_role": "Inventor", "decision": ""},
        )
        assert res.status_code == 422

    def test_empty_reviewer_role_422(self, client, patch_config):
        _make_idea()
        res = client.post(
            "/api/ideas/IDEA-0001/review",
            json={"reviewer_role": "", "decision": "approved"},
        )
        assert res.status_code == 422
