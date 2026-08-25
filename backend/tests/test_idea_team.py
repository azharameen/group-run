"""Class-based tests for the mocked Idea Team research boundary."""

import time

import pytest
from app.agent.teams.idea_team import IDEA_ARTIFACTS, run_idea_research
from app.storage.artifacts import load_artifact_revisions, save_artifact_revision
from app.storage.idea_workspace import idea_folder_path
from app.work_items.idea_mapping import ensure_idea_for_work_item, get_idea_id_for_work_item


def _packet():
    return {
        name: {
            "content": f"# {name}\nEvidence",
            "provenance": f"mock://{name}",
            "evidence_refs": [f"mock://{name}"],
        }
        for name in IDEA_ARTIFACTS
    }


class TestIdeaTeamResearch:
    @pytest.mark.asyncio
    async def test_happy_path_persists_complete_packet(self, patch_config):
        result = await run_idea_research("IDEA-1101", "concept", researcher=lambda _: _packet())
        assert result["state"] == "completed"
        assert [r["artifact_name"] for r in load_artifact_revisions("IDEA-1101")] == list(IDEA_ARTIFACTS)

    @pytest.mark.asyncio
    async def test_provider_failure_is_explicit(self, patch_config):
        result = await run_idea_research(
            "IDEA-1102", "concept", researcher=lambda _: (_ for _ in ()).throw(RuntimeError("provider down"))
        )
        assert result["state"] == "failed"
        assert result["retryable"] is True
        assert load_artifact_revisions("IDEA-1102") == []

    @pytest.mark.asyncio
    async def test_budget_records_incomplete_state(self, patch_config):
        async def slow_provider(_):
            import asyncio

            await asyncio.sleep(0.05)
            return _packet()

        result = await run_idea_research(
            "IDEA-1103", "concept", researcher=slow_provider, time_budget_sec=0.001
        )
        assert result["state"] == "incomplete"

    @pytest.mark.asyncio
    async def test_sync_provider_cannot_evade_deadline(self, patch_config):
        def slow_provider(_):
            time.sleep(0.02)
            return _packet()

        result = await run_idea_research(
            "IDEA-1104", "concept", researcher=slow_provider, time_budget_sec=0.001
        )
        assert result["state"] == "incomplete"
        assert load_artifact_revisions("IDEA-1104") == []

    @pytest.mark.asyncio
    async def test_malformed_evidence_refs_fail_without_artifacts(self, patch_config):
        packet = _packet()
        packet["prior-art"]["evidence_refs"] = ["", 3]
        result = await run_idea_research(
            "IDEA-1105", "concept", researcher=lambda _: packet
        )
        assert result["state"] == "failed"
        assert load_artifact_revisions("IDEA-1105") == []

    def test_workspace_paths_reject_traversal(self, patch_config):
        with pytest.raises(ValueError):
            idea_folder_path("../outside")
        with pytest.raises(ValueError):
            save_artifact_revision(
                "IDEA-1106",
                "../outside",
                "content",
                provenance="test",
                evidence_refs=["source"],
            )

    def test_work_item_maps_to_real_idea_id(self, patch_config):
        work_item_id = "123e4567-e89b-12d3-a456-426614174000"
        idea_id = ensure_idea_for_work_item(work_item_id, title="Mapped concept")
        assert idea_id != work_item_id
        assert get_idea_id_for_work_item(work_item_id) == idea_id
