"""Tests for the idea maturity stage endpoints (story 10.4)."""

import pytest
from app.api.app import create_app
from app.storage.idea_workspace import save_idea_yaml
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    return TestClient(create_app())


def _create_idea(client: TestClient) -> str:
    res = client.post("/api/ideas", json={"title": "Maturity idea"})
    assert res.status_code == 200
    return res.json()["idea_id"]


class TestGetMaturity:
    def test_legacy_read_defaults_to_raw(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.get(f"/api/ideas/{idea_id}/maturity")
        assert res.status_code == 200
        body = res.json()
        assert body["idea_id"] == idea_id
        assert body["stage"] == "raw"
        assert body["history"] == []
        assert body["next_stage"] == "refined"
        assert body["current"] is None
        assert "stage_criteria" in body

    def test_unknown_idea_404(self, client, patch_config):
        res = client.get("/api/ideas/IDEA-9999/maturity")
        assert res.status_code == 404
        assert "IDEA-9999" in res.json()["detail"]

    def test_invalid_idea_id_400(self, client, patch_config):
        assert client.get("/api/ideas/bad-id/maturity").status_code == 400

    def test_corrupt_history_does_not_500(self, client, patch_config):
        idea_id = _create_idea(client)
        save_idea_yaml(
            idea_id,
            "maturity.yaml",
            {"stage": "bogus", "history": ["not-a-dict", {"stage": "bogus"}]},
        )
        res = client.get(f"/api/ideas/{idea_id}/maturity")
        assert res.status_code == 200
        body = res.json()
        assert body["stage"] == "bogus"
        assert body["next_stage"] is None
        assert body["history"] == [{"stage": "bogus"}]

    def test_full_history_terminal(self, client, patch_config):
        idea_id = _create_idea(client)
        for target in ("refined", "validated", "ready-for-planning"):
            res = client.post(
                f"/api/ideas/{idea_id}/maturity",
                json={
                    "stage": target,
                    "criteria": [f"met {target} criteria"],
                    "evidence_refs": ["artifact:research:v1"],
                    "recorded_by": "user",
                },
            )
            assert res.status_code == 201, res.text
        res = client.get(f"/api/ideas/{idea_id}/maturity")
        assert res.status_code == 200
        body = res.json()
        assert body["stage"] == "ready-for-planning"
        assert body["next_stage"] is None
        assert [entry["stage"] for entry in body["history"]] == [
            "refined",
            "validated",
            "ready-for-planning",
        ]


class TestTransitionMaturity:
    def test_happy_transition_raw_to_refined(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={
                "stage": "refined",
                "criteria": ["problem statement names affected users"],
                "evidence_refs": ["artifact:research:v1"],
                "recorded_by": "user",
            },
        )
        assert res.status_code == 201
        body = res.json()
        assert body["idea_id"] == idea_id
        assert body["stage"] == "refined"
        record = body["record"]
        assert record["stage"] == "refined"
        assert record["criteria"] == ["problem statement names affected users"]
        assert record["evidence_refs"] == ["artifact:research:v1"]
        assert record["recorded_by"] == "user"
        assert record["recorded_at"].endswith("+00:00")

        read_back = client.get(f"/api/ideas/{idea_id}/maturity").json()
        assert read_back["stage"] == "refined"
        assert len(read_back["history"]) == 1
        assert read_back["history"][0]["recorded_at"] == record["recorded_at"]

    def test_skip_stage_rejected_409(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "validated", "criteria": ["c"], "evidence_refs": ["e"]},
        )
        assert res.status_code == 409
        detail = res.json()["detail"]
        assert "raw" in detail and "validated" in detail
        assert client.get(f"/api/ideas/{idea_id}/maturity").json()["stage"] == "raw"

    def test_backward_transition_rejected_409(self, client, patch_config):
        idea_id = _create_idea(client)
        for target in ("refined", "validated"):
            res = client.post(
                f"/api/ideas/{idea_id}/maturity",
                json={"stage": target, "criteria": ["c"], "evidence_refs": ["e"]},
            )
            assert res.status_code == 201
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": ["c"], "evidence_refs": ["e"]},
        )
        assert res.status_code == 409
        assert client.get(f"/api/ideas/{idea_id}/maturity").json()["stage"] == "validated"

    def test_terminal_transition_rejected_409(self, client, patch_config):
        idea_id = _create_idea(client)
        for target in ("refined", "validated", "ready-for-planning"):
            res = client.post(
                f"/api/ideas/{idea_id}/maturity",
                json={"stage": target, "criteria": ["c"], "evidence_refs": ["e"]},
            )
            assert res.status_code == 201
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": ["c"], "evidence_refs": ["e"]},
        )
        assert res.status_code == 409
        assert "ready-for-planning" in res.json()["detail"]

    def test_unknown_idea_404(self, client, patch_config):
        res = client.post(
            "/api/ideas/IDEA-9998/maturity",
            json={"stage": "refined", "criteria": ["c"], "evidence_refs": ["e"]},
        )
        assert res.status_code == 404
        assert "IDEA-9998" in res.json()["detail"]

    def test_transition_from_unknown_stage_409(self, client, patch_config):
        idea_id = _create_idea(client)
        save_idea_yaml(
            idea_id,
            "maturity.yaml",
            {"stage": "bogus", "history": [{"stage": "bogus"}]},
        )
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": ["c"], "evidence_refs": ["e"]},
        )
        assert res.status_code == 409
        assert "unknown stage" in res.json()["detail"]

    def test_empty_criteria_422(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": [], "evidence_refs": ["e"]},
        )
        assert res.status_code == 422

    def test_blank_criteria_entry_422(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": ["   "], "evidence_refs": ["e"]},
        )
        assert res.status_code == 422

    def test_blank_evidence_ref_422(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": ["c"], "evidence_refs": [""]},
        )
        assert res.status_code == 422

    def test_unknown_stage_422(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "shipped", "criteria": ["c"], "evidence_refs": ["e"]},
        )
        assert res.status_code == 422

    def test_oversized_criteria_entry_422(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={"stage": "refined", "criteria": ["x" * 501], "evidence_refs": ["e"]},
        )
        assert res.status_code == 422

    def test_too_many_criteria_entries_422(self, client, patch_config):
        idea_id = _create_idea(client)
        res = client.post(
            f"/api/ideas/{idea_id}/maturity",
            json={
                "stage": "refined",
                "criteria": [f"c{i}" for i in range(51)],
                "evidence_refs": ["e"],
            },
        )
        assert res.status_code == 422

    def test_history_ordering_after_three_transitions(self, client, patch_config):
        idea_id = _create_idea(client)
        for target in ("refined", "validated", "ready-for-planning"):
            res = client.post(
                f"/api/ideas/{idea_id}/maturity",
                json={"stage": target, "criteria": ["c"], "evidence_refs": ["e"]},
            )
            assert res.status_code == 201
        history = client.get(f"/api/ideas/{idea_id}/maturity").json()["history"]
        assert [entry["stage"] for entry in history] == [
            "refined",
            "validated",
            "ready-for-planning",
        ]
        timestamps = [entry["recorded_at"] for entry in history]
        assert timestamps == sorted(timestamps)
        assert all(entry["recorded_by"] == "user" for entry in history)
