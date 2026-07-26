"""Pydantic models for ideas and scoring."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class WorkflowState(str, Enum):
    raw_signal_collected = "raw_signal_collected"
    idea_discovery = "idea_discovery"
    idea_clarification = "idea_clarification"
    novelty_hypothesis = "novelty_hypothesis"
    prior_art_review = "prior_art_review"
    detectability_review = "detectability_review"
    business_value_review = "business_value_review"
    siemens_innovation_alignment = "siemens_innovation_alignment"
    ideascope_draft = "ideascope_draft"
    siemens_internal_filing_check = "siemens_internal_filing_check"
    manager_or_enabler_review = "manager_or_enabler_review"
    ip_review = "ip_review"
    siemens_ip_counsel_validation = "siemens_ip_counsel_validation"
    ready_for_submission = "ready_for_submission"
    submitted = "submitted"
    feedback_received = "feedback_received"
    revision_in_progress = "revision_in_progress"
    accepted_or_closed = "accepted_or_closed"


PHASE_GROUPS = {
    "discovery": [
        WorkflowState.raw_signal_collected,
        WorkflowState.idea_discovery,
        WorkflowState.idea_clarification,
    ],
    "research": [
        WorkflowState.novelty_hypothesis,
        WorkflowState.prior_art_review,
        WorkflowState.detectability_review,
    ],
    "analysis": [
        WorkflowState.business_value_review,
        WorkflowState.siemens_innovation_alignment,
    ],
    "drafting": [
        WorkflowState.ideascope_draft,
        WorkflowState.siemens_internal_filing_check,
    ],
    "review": [
        WorkflowState.manager_or_enabler_review,
        WorkflowState.ip_review,
        WorkflowState.siemens_ip_counsel_validation,
    ],
    "done": [
        WorkflowState.ready_for_submission,
        WorkflowState.submitted,
        WorkflowState.feedback_received,
        WorkflowState.revision_in_progress,
        WorkflowState.accepted_or_closed,
    ],
}


def phase_for_state(state: WorkflowState) -> str:
    for phase, states in PHASE_GROUPS.items():
        if state in states:
            return phase
    return "unknown"


class StateTransition(BaseModel):
    from_state: WorkflowState
    to_state: WorkflowState
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    agent_responsible: str = ""
    validation_passed: bool = False
    score_at_transition: float = 0.0
    notes: str = ""


class ScoreBreakdown(BaseModel):
    novelty: float = 0.0
    siemens_alignment: float = 0.0
    technical_feasibility: float = 0.0
    detectability: float = 0.0
    business_value: float = 0.0
    originality: float = 0.0
    completeness: float = 0.0


class ScoreRecord(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    composite: float = 0.0
    breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    strength_rating: str = ""
    agent_responsible: str = ""


class IdeaScopeDraft(BaseModel):
    title: str = ""
    abstract: str = ""
    field_of_invention: str = ""
    background: str = ""
    summary: str = ""
    brief_description: str = ""
    detailed_description: str = ""
    claims: list[str] = Field(default_factory=list)
    prior_art_cited: list[str] = Field(default_factory=list)


class IdeaRecord(BaseModel):
    idea_id: str = ""
    title: str = ""
    current_state: WorkflowState = WorkflowState.raw_signal_collected
    phase: str = "discovery"
    signal_text: str = ""
    problem_statement: str = ""
    solution_concept: str = ""
    siemens_domain: str = ""
    siemens_business_unit: str = ""

    state_history: list[StateTransition] = Field(default_factory=list)
    scores: list[ScoreRecord] = Field(default_factory=list)
    latest_composite: float = 0.0

    ideascope_draft: Optional[IdeaScopeDraft] = None
    source_evidence: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    running_agent: str = ""

    def update_phase(self):
        self.phase = phase_for_state(self.current_state)

    def latest_score(self) -> Optional[ScoreRecord]:
        return self.scores[-1] if self.scores else None

    @property
    def score_history(self) -> list[float]:
        return [s.composite for s in self.scores]

    @property
    def score_trend(self) -> str:
        vals = self.score_history
        if len(vals) < 2:
            return "—"
        if vals[-1] > vals[-2]:
            return "▲"
        if vals[-1] < vals[-2]:
            return "▼"
        return "→"


class IdeaRegistry(BaseModel):
    ideas: list[dict[str, Any]] = Field(default_factory=list)
    next_id: int = 1
