"""Workflow state definitions and metadata helpers."""

import os

import yaml

from ..config import CONFIG_DIR
from ..models.idea import WorkflowState


TRANSITIONS: list[tuple[str, WorkflowState, WorkflowState]] = [
    ("advance_to_idea_discovery", WorkflowState.raw_signal_collected, WorkflowState.idea_discovery),
    ("advance_to_idea_clarification", WorkflowState.idea_discovery, WorkflowState.idea_clarification),
    ("advance_to_novelty_hypothesis", WorkflowState.idea_clarification, WorkflowState.novelty_hypothesis),
    ("advance_to_prior_art_review", WorkflowState.novelty_hypothesis, WorkflowState.prior_art_review),
    ("advance_to_detectability_review", WorkflowState.prior_art_review, WorkflowState.detectability_review),
    ("advance_to_business_value_review", WorkflowState.detectability_review, WorkflowState.business_value_review),
    ("advance_to_siemens_alignment", WorkflowState.business_value_review, WorkflowState.siemens_innovation_alignment),
    ("advance_to_ideascope_draft", WorkflowState.siemens_innovation_alignment, WorkflowState.ideascope_draft),
    ("advance_to_siemens_filing_check", WorkflowState.ideascope_draft, WorkflowState.siemens_internal_filing_check),
    ("advance_to_manager_review", WorkflowState.siemens_internal_filing_check, WorkflowState.manager_or_enabler_review),
    ("advance_to_ip_review", WorkflowState.manager_or_enabler_review, WorkflowState.ip_review),
    ("advance_to_counsel_validation", WorkflowState.ip_review, WorkflowState.siemens_ip_counsel_validation),
    ("advance_to_ready", WorkflowState.siemens_ip_counsel_validation, WorkflowState.ready_for_submission),
    ("advance_to_submitted", WorkflowState.ready_for_submission, WorkflowState.submitted),
    ("advance_to_feedback", WorkflowState.submitted, WorkflowState.feedback_received),
    ("advance_to_revision", WorkflowState.feedback_received, WorkflowState.revision_in_progress),
    ("advance_to_accepted", WorkflowState.revision_in_progress, WorkflowState.accepted_or_closed),
]

AGENT_BY_STATE: dict[WorkflowState, str] = {
    WorkflowState.raw_signal_collected: "knowledge-curator",
    WorkflowState.idea_discovery: "idea-discoverer",
    WorkflowState.idea_clarification: "problem-framer",
    WorkflowState.novelty_hypothesis: "novelty-analyst",
    WorkflowState.prior_art_review: "prior-art-researcher",
    WorkflowState.detectability_review: "detectability-analyst",
    WorkflowState.business_value_review: "business-value-analyst",
    WorkflowState.siemens_innovation_alignment: "siemens-alignment",
    WorkflowState.ideascope_draft: "patent-drafter",
    WorkflowState.siemens_internal_filing_check: "checklist-validator",
    WorkflowState.manager_or_enabler_review: "reviewer-summarizer",
    WorkflowState.ip_review: "reviewer-summarizer",
    WorkflowState.siemens_ip_counsel_validation: "checklist-validator",
    WorkflowState.ready_for_submission: "reviewer-summarizer",
    WorkflowState.submitted: "knowledge-curator",
    WorkflowState.feedback_received: "knowledge-curator",
    WorkflowState.revision_in_progress: "patent-drafter",
    WorkflowState.accepted_or_closed: "knowledge-curator",
}

GATE_BY_TRANSITION: dict[tuple[str, str], str] = {
    ("idea_discovery", "idea_clarification"): "idea_discovery_to_idea_clarification",
    ("idea_clarification", "novelty_hypothesis"): "idea_clarification_to_novelty_hypothesis",
    ("novelty_hypothesis", "prior_art_review"): "novelty_hypothesis_to_prior_art_review",
    ("prior_art_review", "detectability_review"): "prior_art_review_to_detectability_review",
    ("detectability_review", "business_value_review"): "detectability_review_to_business_value_review",
    ("business_value_review", "siemens_innovation_alignment"): "business_value_review_to_siemens_innovation_alignment",
    ("siemens_innovation_alignment", "ideascope_draft"): "siemens_innovation_alignment",
    ("ideascope_draft", "siemens_internal_filing_check"): "ideascope_draft_to_siemens_internal_filing_check",
    ("siemens_internal_filing_check", "manager_or_enabler_review"): "siemens_internal_filing_check",
    ("manager_or_enabler_review", "ip_review"): "manager_or_enabler_review",
    ("ip_review", "siemens_ip_counsel_validation"): "ip_review",
    ("siemens_ip_counsel_validation", "ready_for_submission"): "siemens_ip_counsel_validation",
}


def agent_for_state(state: WorkflowState) -> str:
    return AGENT_BY_STATE.get(state, "unknown")


def gate_name_for_transition(from_state: str, to_state: str) -> str:
    return GATE_BY_TRANSITION.get((from_state, to_state), "")


def load_checklist(gate_name: str) -> list[dict]:
    if not gate_name:
        return []
    path = os.path.join(CONFIG_DIR, "checklist-config.yaml")
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    gate = config.get("gates", {}).get(gate_name)
    return gate.get("items", []) if gate else []
