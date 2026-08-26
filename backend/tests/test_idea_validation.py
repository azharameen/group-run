"""Mocked-provider coverage for Story 11.2 novelty validation."""

import asyncio
import time

import pytest
from app.agent.teams.idea_validation import run_idea_validation, validation_status
from app.storage.artifacts import load_artifact_revisions, save_artifact_revision
from app.storage.idea_workspace import save_idea_yaml
from app.work_items.idea_mapping import ensure_idea_for_work_item


def _assessment():
    return {
        "novelty_score": 8,
        "patentability_score": 7,
        "patentability_outcome": "likely",
        "fto_risk": "moderate",
        "fto_analysis": "Additional claim-chart review is recommended.",
        "confidence": 6,
        "rationale": "The cited prior art does not disclose the combined features.",
        "prior_art_refs": ["https://example.test/patent/1"],
        "source_refs": ["https://example.test/patent/1"],
        "provenance": "mock://idea-team-validator",
    }


def _research_ready(idea_id: str) -> None:
    save_idea_yaml(
        idea_id,
        "idea.yaml",
        {
            "idea_id": idea_id,
            "research": {
                "state": "completed",
                "completed_artifacts": ["market-summary", "prior-art"],
            },
        },
    )
    save_artifact_revision(
        idea_id,
        "prior-art",
        "# Prior art\nEvidence",
        provenance="mock://research",
        evidence_refs=["https://example.test/patent/1"],
        agent_id="idea-team",
    )


class TestIdeaValidation:
    @pytest.mark.asyncio
    async def test_happy_path_persists_provenance_aware_assessment(self, patch_config):
        idea_id = ensure_idea_for_work_item("work-1102", title="Concept")
        _research_ready(idea_id)
        result = await run_idea_validation(
            idea_id, validator=lambda _: _assessment(), work_item_id="work-1102"
        )
        assert result["state"] == "completed"
        assert result["summary"]["novelty_score"] == 8
        assert result["summary"]["agent_id"] == "idea-team-validator"
        revisions = load_artifact_revisions(idea_id)
        assert revisions[-1]["artifact_name"] == "novelty-assessment"
        assert revisions[-1]["version"] == 1
        assert validation_status(idea_id)["summary"]["artifact_version"] == 1

    @pytest.mark.asyncio
    async def test_missing_research_writes_no_assessment(self, patch_config):
        result = await run_idea_validation("IDEA-1102", validator=lambda _: _assessment())
        assert result["state"] == "failed"
        assert "research" in result["error"]
        assert not [r for r in load_artifact_revisions("IDEA-1102") if r["artifact_name"] == "novelty-assessment"]

    @pytest.mark.asyncio
    async def test_invalid_provider_output_is_explicit(self, patch_config):
        idea_id = "IDEA-1103"
        _research_ready(idea_id)
        invalid = {**_assessment(), "novelty_score": 11}
        result = await run_idea_validation(idea_id, validator=lambda _: invalid)
        assert result["state"] == "failed"
        assert load_artifact_revisions(idea_id)[-1]["artifact_name"] == "prior-art"

    @pytest.mark.asyncio
    async def test_repeat_run_increments_assessment_revision(self, patch_config):
        idea_id = "IDEA-1104"
        _research_ready(idea_id)
        await run_idea_validation(idea_id, validator=lambda _: _assessment())
        second = {**_assessment(), "novelty_score": 5}
        result = await run_idea_validation(idea_id, validator=lambda _: second)
        assert result["state"] == "completed"
        assessments = [r for r in load_artifact_revisions(idea_id) if r["artifact_name"] == "novelty-assessment"]
        assert [r["version"] for r in assessments] == [1, 2]
        assert assessments[-1]["diff"]

    @pytest.mark.asyncio
    async def test_timeout_is_incomplete_without_partial_artifact(self, patch_config):
        idea_id = "IDEA-1105"
        _research_ready(idea_id)

        def slow(_):
            time.sleep(0.02)
            return _assessment()

        result = await run_idea_validation(idea_id, validator=slow, time_budget_sec=0.001)
        assert result["state"] == "incomplete"
        assert not [r for r in load_artifact_revisions(idea_id) if r["artifact_name"] == "novelty-assessment"]

    @pytest.mark.asyncio
    async def test_cancellation_is_explicit(self, patch_config):
        idea_id = "IDEA-1106"
        _research_ready(idea_id)

        async def slow(_):
            await asyncio.sleep(1)
            return _assessment()

        task = asyncio.create_task(run_idea_validation(idea_id, validator=slow))
        await asyncio.sleep(0.001)
        task.cancel()
        result = await task
        assert result["state"] == "cancelled"
        assert not [r for r in load_artifact_revisions(idea_id) if r["artifact_name"] == "novelty-assessment"]
