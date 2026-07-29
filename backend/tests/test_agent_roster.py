"""Tests for the workflow agent roster and state ownership mapping."""

from app.orchestrator.subagents.definitions import ALL_SUBAGENTS
from app.state.definitions import agent_for_state
from app.models.idea import WorkflowState


def test_workflow_state_owner_mapping_is_explicit():
    assert agent_for_state(WorkflowState.prior_art_review) == "prior-art-researcher"
    assert agent_for_state(WorkflowState.ideascope_draft) == "patent-drafter"
    assert agent_for_state(WorkflowState.manager_or_enabler_review) == "reviewer-summarizer"


def test_subagent_roster_contains_unique_runtime_roles():
    names = [subagent.name for subagent in ALL_SUBAGENTS]
    assert len(names) == len(set(names))
    assert "prior-art-researcher" in names
    assert "reviewer-summarizer" in names
