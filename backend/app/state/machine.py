"""Formal state machine using the `transitions` library with lifecycle hooks.

Every state has:
  on_entry()  → Load config, init working folder, assign subagent
  validate()  → Run gate checklist, check scores, return PASS/FAIL
  on_exit()   → Record transition, write changelog, handover packet
"""

import os
from datetime import datetime
from typing import Any, Optional, Callable

from transitions import Machine

from ..config import settings
from ..models.idea import (
    WorkflowState,
    StateTransition,
    phase_for_state,
)
from .definitions import TRANSITIONS, agent_for_state, gate_name_for_transition, load_checklist
from .gates import check_evidence
from ..storage.yaml_io import (
    load_idea_yaml,
    save_idea_yaml,
    write_changelog_entry,
    write_handover,
)


# ── Forward declaration of emit_sse (set at runtime by main.py) ──
emit_sse_callback: Optional[Callable] = None


def set_emit_sse_callback(cb: Callable):
    global emit_sse_callback
    emit_sse_callback = cb


# ── All 18 workflow states ──
ALL_STATES = [s.value for s in WorkflowState]


# ── Guard condition: validate() must pass before transition ──
def _gate_check_condition(event_data) -> bool:
    """Guard: returns True only if validate() passes for this transition."""
    machine: PatentWorkflowMachine = event_data.model
    idea_id = machine.idea_id
    from_state = event_data.event.name.split("_to_")[0] if "_to_" in event_data.event.name else machine.state
    to_state = event_data.transition.dest

    result = machine._validate(idea_id, from_state, to_state)
    return result


class PatentWorkflowMachine:
    """A single-idea state machine with lifecycle hooks."""

    def __init__(self, idea_id: str):
        self.idea_id = idea_id
        self.retry_count = 0
        self.last_validation_result: Optional[dict] = None

        # Build the machine
        self.machine = Machine(
            model=self,
            states=ALL_STATES,
            initial=WorkflowState.raw_signal_collected.value,
            auto_transitions=False,
            send_event=True,
            queued=True,  # ensures sequential processing
        )

        # Register transitions with condition (guard) and after (callback)
        self._add_transitions()

    @property
    def current_state(self) -> WorkflowState:
        """Return the current workflow state as an enum for compatibility."""
        return WorkflowState(self.state)

    @property
    def state_history(self) -> list[StateTransition]:
        """Return the recorded state history as typed transition objects."""
        state_data = load_idea_yaml(self.idea_id, "state.yaml") or {}
        history = state_data.get("history", [])
        transitions: list[StateTransition] = []
        for item in history:
            if not isinstance(item, dict):
                continue
            from_state = item.get("from") or item.get("from_state")
            to_state = item.get("to") or item.get("to_state") or item.get("state")
            if not from_state or not to_state:
                continue
            try:
                transitions.append(StateTransition(
                    from_state=WorkflowState(str(from_state)),
                    to_state=WorkflowState(str(to_state)),
                    timestamp=item.get("timestamp", datetime.utcnow()),
                    agent_responsible=str(item.get("agent_responsible", "")),
                    validation_passed=bool((item.get("validation") or {}).get("passed", False)),
                ))
            except Exception:
                continue
        return transitions

    def advance_to_next(self) -> dict[str, Any]:
        """Advance exactly one registered step, if possible."""
        next_state = self._next_registered_state(self.state)
        if not next_state:
            return {"success": False, "reason": "No next state available", "state": self.state}
        return self._advance_to_state(next_state)

    def advance_to(self, target_state: str) -> dict[str, Any]:
        """Advance to a specific target state if it is the next registered step.

        The state machine advances one transition per call. Longer paths should
        be achieved by repeated calls to `advance_to_next()` or by invoking this
        method again after each successful step.
        """
        try:
            target = WorkflowState(target_state)
        except Exception:
            return {"success": False, "reason": f"Unknown state: {target_state}", "state": self.state}

        if target == self.current_state:
            return {"success": True, "state": self.state, "message": "Already at target state"}

        next_state = self._next_registered_state(self.state)
        if next_state is None or next_state != target:
            return {"success": False, "reason": f"{target.value} is not the next reachable state", "state": self.state}

        return self._advance_to_state(target)

    def _next_registered_state(self, current_state: str) -> WorkflowState | None:
        """Return the next state in the linear workflow order, if any."""
        try:
            idx = ALL_STATES.index(current_state)
        except ValueError:
            return None
        if idx + 1 >= len(ALL_STATES):
            return None
        try:
            return WorkflowState(ALL_STATES[idx + 1])
        except Exception:
            return None

    def _advance_to_state(self, target: WorkflowState) -> dict[str, Any]:
        """Invoke the transition trigger that leads to the given target state."""
        trigger_map = {
            WorkflowState.idea_discovery: self.advance_to_idea_discovery,
            WorkflowState.idea_clarification: self.advance_to_idea_clarification,
            WorkflowState.novelty_hypothesis: self.advance_to_novelty_hypothesis,
            WorkflowState.prior_art_review: self.advance_to_prior_art_review,
            WorkflowState.detectability_review: self.advance_to_detectability_review,
            WorkflowState.business_value_review: self.advance_to_business_value_review,
            WorkflowState.siemens_innovation_alignment: self.advance_to_siemens_alignment,
            WorkflowState.ideascope_draft: self.advance_to_ideascope_draft,
            WorkflowState.siemens_internal_filing_check: self.advance_to_siemens_filing_check,
            WorkflowState.manager_or_enabler_review: self.advance_to_manager_review,
            WorkflowState.ip_review: self.advance_to_ip_review,
            WorkflowState.siemens_ip_counsel_validation: self.advance_to_counsel_validation,
            WorkflowState.ready_for_submission: self.advance_to_ready,
            WorkflowState.submitted: self.advance_to_submitted,
            WorkflowState.feedback_received: self.advance_to_feedback,
            WorkflowState.revision_in_progress: self.advance_to_revision,
            WorkflowState.accepted_or_closed: self.advance_to_accepted,
        }

        trigger = trigger_map.get(target)
        if trigger is None:
            return {"success": False, "reason": f"No trigger registered for {target.value}", "state": self.state}

        try:
            trigger()
            return {"success": True, "state": self.state, "target": target.value}
        except Exception as exc:
            return {"success": False, "reason": str(exc), "state": self.state, "target": target.value}

    def _add_transitions(self):
        """Register all allowed state transitions."""
        for trigger, source, dest in TRANSITIONS:
            self.machine.add_transition(
                trigger=trigger,
                source=source.value,
                dest=dest.value,
                conditions=None,  # We do validation in the tool, not as condition
                after="_on_transition_complete",
            )

    # ── Lifecycle: on_entry ──
    def on_entry_raw_signal_collected(self, event_data):
        self._run_on_entry(WorkflowState.raw_signal_collected)

    def on_entry_idea_discovery(self, event_data):
        self._run_on_entry(WorkflowState.idea_discovery)

    def on_entry_idea_clarification(self, event_data):
        self._run_on_entry(WorkflowState.idea_clarification)

    def on_entry_novelty_hypothesis(self, event_data):
        self._run_on_entry(WorkflowState.novelty_hypothesis)

    def on_entry_prior_art_review(self, event_data):
        self._run_on_entry(WorkflowState.prior_art_review)

    def on_entry_detectability_review(self, event_data):
        self._run_on_entry(WorkflowState.detectability_review)

    def on_entry_business_value_review(self, event_data):
        self._run_on_entry(WorkflowState.business_value_review)

    def on_entry_siemens_innovation_alignment(self, event_data):
        self._run_on_entry(WorkflowState.siemens_innovation_alignment)

    def on_entry_ideascope_draft(self, event_data):
        self._run_on_entry(WorkflowState.ideascope_draft)

    def on_entry_siemens_internal_filing_check(self, event_data):
        self._run_on_entry(WorkflowState.siemens_internal_filing_check)

    def on_entry_manager_or_enabler_review(self, event_data):
        self._run_on_entry(WorkflowState.manager_or_enabler_review)

    def on_entry_ip_review(self, event_data):
        self._run_on_entry(WorkflowState.ip_review)

    def on_entry_siemens_ip_counsel_validation(self, event_data):
        self._run_on_entry(WorkflowState.siemens_ip_counsel_validation)

    def on_entry_ready_for_submission(self, event_data):
        self._run_on_entry(WorkflowState.ready_for_submission)

    def on_entry_submitted(self, event_data):
        self._run_on_entry(WorkflowState.submitted)

    def on_entry_feedback_received(self, event_data):
        self._run_on_entry(WorkflowState.feedback_received)

    def on_entry_revision_in_progress(self, event_data):
        self._run_on_entry(WorkflowState.revision_in_progress)

    def on_entry_accepted_or_closed(self, event_data):
        self._run_on_entry(WorkflowState.accepted_or_closed)

    def _run_on_entry(self, state: WorkflowState):
        """HOOK 1: Load state config, init folder, emit progress."""
        idea_id = self.idea_id
        self._emit("agent.progress", {
            "idea_id": idea_id,
            "message": f"Entering state: {state.value}",
            "state": state.value,
        })

        # Save state.yaml snapshot
        state_data = load_idea_yaml(idea_id, "state.yaml") or {
            "idea_id": idea_id,
            "history": [],
        }
        state_data["current_state"] = state.value
        state_data["phase"] = phase_for_state(state)
        state_data["entered_at"] = datetime.utcnow().isoformat()
        state_data["agent_responsible"] = agent_for_state(state)
        save_idea_yaml(idea_id, "state.yaml", state_data)

        # Also update idea.yaml with running_agent so the dashboard picks it up
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        idea_data["running_agent"] = agent_for_state(state)
        idea_data["phase"] = phase_for_state(state)
        idea_data["current_state"] = state.value
        idea_data["updated_at"] = datetime.utcnow().isoformat()
        save_idea_yaml(idea_id, "idea.yaml", idea_data)

        self._emit("idea.transition", {
            "idea_id": idea_id,
            "to": state.value,
            "phase": phase_for_state(state),
        })

    # ── Lifecycle: validate ──
    def _validate(self, idea_id: str, from_state: str, to_state: str) -> bool:
        """HOOK 2: Run gate checklist. Returns True (pass) or False (fail)."""
        gate_name = gate_name_for_transition(from_state, to_state)
        checklist = load_checklist(gate_name)

        if not checklist:
            # No gate checklist = auto-pass
            self.last_validation_result = {"passed": True, "gate": gate_name, "items": []}
            return True

        passed_items = 0
        failed_items = []
        for item in checklist:
            item_passed = check_evidence(idea_id, item["id"])
            if item_passed:
                passed_items += 1
            else:
                failed_items.append(f"{item['id']}: {item['description']}")

        all_passed = len(failed_items) == 0
        self.last_validation_result = {
            "passed": all_passed,
            "gate": gate_name,
            "total": len(checklist),
            "passed_count": passed_items,
            "failed_items": failed_items,
        }

        if all_passed:
            self._emit("gate.passed", {
                "idea_id": idea_id,
                "gate": gate_name,
                "checklist_items": len(checklist),
                "passed": passed_items,
            })
        else:
            self._emit("gate.failed", {
                "idea_id": idea_id,
                "gate": gate_name,
                "checklist_items": len(checklist),
                "passed": passed_items,
                "failed": failed_items,
            })

        return all_passed

    # ── Lifecycle: on_exit (via _on_transition_complete) ──
    def _on_transition_complete(self, event_data):
        """HOOK 3: Called AFTER a successful transition. Writes audit trail."""
        source = event_data.transition.source
        dest = event_data.transition.dest
        idea_id = self.idea_id

        # Write changelog
        entry = (
            f"Idea **{idea_id}** transitioned from **{source}** → **{dest}**.\n"
        )
        if self.last_validation_result:
            entry += f"- Validation: {'✅ PASS' if self.last_validation_result['passed'] else '❌ FAIL'}\n"
            if not self.last_validation_result["passed"]:
                entry += f"- Failed items: {', '.join(self.last_validation_result['failed_items'])}\n"
        write_changelog_entry(idea_id, entry)

        # Write handover packet
        handover = (
            f"## Handover: {source} → {dest}\n\n"
            f"**From:** {agent_for_state(WorkflowState(source))}\n"
            f"**To:** {agent_for_state(WorkflowState(dest))}\n"
            f"**Timestamp:** {datetime.utcnow().isoformat()}\n\n"
            f"### Validation\n"
            f"Result: {'✅ PASS' if self.last_validation_result and self.last_validation_result['passed'] else '⚠️ See notes'}\n\n"
            f"### Summary\n"
            f"Transition completed from {source} to {dest}.\n"
        )
        write_handover(idea_id, source, dest, handover)

        # Update state.yaml
        state_data = load_idea_yaml(idea_id, "state.yaml") or {}
        history = state_data.get("history", [])
        history.append({
            "from": source,
            "to": dest,
            "state": dest,  # Keep for backward compat with timeline
            "timestamp": datetime.utcnow().isoformat(),
            "validation": self.last_validation_result,
            "agent_responsible": agent_for_state(WorkflowState(dest)),
        })
        state_data["history"] = history
        state_data["previous_state"] = source
        state_data["current_state"] = dest
        state_data["updated_at"] = datetime.utcnow().isoformat()
        save_idea_yaml(idea_id, "state.yaml", state_data)

        # Also update idea.yaml metadata so /api/ideas returns current state
        idea_meta = load_idea_yaml(idea_id, "idea.yaml") or {}
        idea_meta["current_state"] = dest
        idea_meta["phase"] = phase_for_state(WorkflowState(dest))
        idea_meta["updated_at"] = datetime.utcnow().isoformat()
        save_idea_yaml(idea_id, "idea.yaml", idea_meta)

        self._emit("idea.transition", {
            "idea_id": idea_id,
            "from": source,
            "to": dest,
            "validation": self.last_validation_result,
        })

        self.retry_count = 0

    # ── Helpers ──
    def _emit(self, event_type: str, data: dict):
        if emit_sse_callback:
            emit_sse_callback(event_type, data)

    def validate_gate(self, idea_id: str, gate_name: str) -> dict:
        """Public API: run gate validation."""
        checklist = load_checklist(gate_name)
        if not checklist:
            return {"passed": True, "gate": gate_name, "items": []}

        passed = 0
        failed = []
        for item in checklist:
            if check_evidence(idea_id, item["id"]):
                passed += 1
            else:
                failed.append(f"{item['id']}: {item['description']}")

        all_passed = len(failed) == 0
        result = {
            "passed": all_passed,
            "gate": gate_name,
            "total": len(checklist),
            "passed_count": passed,
            "failed_items": failed,
        }

        if all_passed:
            self._emit("gate.passed", {
                "idea_id": idea_id,
                "gate": gate_name,
                "checklist_items": len(checklist),
                "passed": passed,
            })
        else:
            self._emit("gate.failed", {
                "idea_id": idea_id,
                "gate": gate_name,
                "checklist_items": len(checklist),
                "passed": passed,
                "failed": failed,
            })

        return result

    @property
    def current_state_obj(self) -> WorkflowState:
        return WorkflowState(self.state)

    def can_transition_to(self, target: WorkflowState) -> bool:
        """Check if a transition to the target state is registered."""
        for t in self.machine.get_transitions():
            if t.source == self.state and t.dest == target.value:
                return True
        return False


def create_workflow_machine(idea_id: str) -> PatentWorkflowMachine:
    """Create a workflow machine for an idea, restoring from saved state if available."""
    machine = PatentWorkflowMachine(idea_id)

    # Try to restore saved state
    state_data = load_idea_yaml(idea_id, "state.yaml")
    if state_data and "current_state" in state_data:
        saved_state = state_data["current_state"]
        if saved_state != machine.state:
            # Force-set the state without triggering transitions
            machine.machine.set_state(saved_state)

    return machine
