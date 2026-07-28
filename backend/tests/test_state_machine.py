"""Tests for the workflow state machine."""

import os
from types import SimpleNamespace

import pytest
import yaml
from fastapi.testclient import TestClient

from app.api.app import create_app
from app.models.idea import WorkflowState, phase_for_state
from app.state.machine import create_workflow_machine, PatentWorkflowMachine
from app.storage.yaml_io import load_transcript_events


class TestWorkflowStateEnum:
    def test_all_states_have_phase(self):
        """Every WorkflowState should map to a known phase."""
        for state in WorkflowState:
            phase = phase_for_state(state)
            assert phase != "unknown", f"{state.value} has no phase mapping"

    def test_phase_groups_cover_all_states(self):
        """All states should appear in exactly one phase group."""
        from app.models.idea import PHASE_GROUPS
        all_in_groups = set()
        for states in PHASE_GROUPS.values():
            all_in_groups.update(states)
        assert all_in_groups == set(WorkflowState)


class TestWorkflowMachine:
    def test_create_machine_starts_at_raw_signal(self, patch_config):
        """A new machine should start at raw_signal_collected."""
        machine = create_workflow_machine("IDEA-TEST-001")
        assert machine.current_state == WorkflowState.raw_signal_collected

    def test_advance_to_next_state(self, patch_config):
        """Advancing from raw_signal should reach idea_discovery."""
        machine = create_workflow_machine("IDEA-TEST-002")
        # Write a minimal idea.yaml so validate() can run
        folder = os.path.join(patch_config, "ideas", "IDEA-TEST-002")
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "idea.yaml"), "w") as f:
            yaml.dump({"title": "Test", "current_state": "raw_signal_collected"}, f)

        result = machine.advance_to_next()
        assert result["success"] is True
        assert machine.current_state == WorkflowState.idea_discovery

    def test_advance_to_specific_state(self, patch_config):
        """Advancing to a named state should work if the path is valid."""
        machine = create_workflow_machine("IDEA-TEST-003")
        folder = os.path.join(patch_config, "ideas", "IDEA-TEST-003")
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "idea.yaml"), "w") as f:
            yaml.dump({"title": "Test", "current_state": "raw_signal_collected"}, f)

        result = machine.advance_to("idea_discovery")
        assert result["success"] is True
        assert machine.current_state == WorkflowState.idea_discovery

    def test_invalid_transition_returns_failure(self, patch_config):
        """Transitioning to an unreachable state should fail gracefully."""
        machine = create_workflow_machine("IDEA-TEST-004")
        folder = os.path.join(patch_config, "ideas", "IDEA-TEST-004")
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "idea.yaml"), "w") as f:
            yaml.dump({"title": "Test", "current_state": "raw_signal_collected"}, f)

        # Try to jump to a state far ahead
        result = machine.advance_to("ready_for_submission")
        assert result["success"] is False

    def test_state_history_is_recorded(self, patch_config):
        """Each transition should append to state_history."""
        machine = create_workflow_machine("IDEA-TEST-005")
        folder = os.path.join(patch_config, "ideas", "IDEA-TEST-005")
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "idea.yaml"), "w") as f:
            yaml.dump({"title": "Test", "current_state": "raw_signal_collected"}, f)

        machine.advance_to_next()
        assert len(machine.state_history) >= 1
        last = machine.state_history[-1]
        assert last.from_state == WorkflowState.raw_signal_collected
        assert last.to_state == WorkflowState.idea_discovery

    def test_review_transitions_create_pending_interrupt(self, patch_config):
        """Transitioning into a review state should create a blocking interrupt."""
        idea_id = "IDEA-TEST-006"
        folder = os.path.join(patch_config, "ideas", idea_id)
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "idea.yaml"), "w", encoding="utf-8") as f:
            yaml.dump({"title": "Test", "current_state": "manager_or_enabler_review"}, f)

        machine = create_workflow_machine(idea_id)
        machine._on_transition_complete(
            SimpleNamespace(
                transition=SimpleNamespace(
                    source="ideascope_draft",
                    dest="manager_or_enabler_review",
                )
            )
        )

        assert load_transcript_events(idea_id)[-1]["type"] == "interrupt"

        client = TestClient(create_app())
        interrupts = client.get(f"/api/workflow/interrupts?idea_id={idea_id}")
        assert interrupts.status_code == 200
        assert interrupts.json()["pending_interrupts"]
