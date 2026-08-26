"""Pydantic models for work items and routing decisions (Story 8.2).

Defines the shape of a submitted work item, the explainable routing
decision recorded by the Chief of Staff, and the request model served
by the /api/work-items endpoints.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

from . import lifecycle
from .product_definition_models import (
    EstimateBasis,
    EstimateNumber,
    GeneratedTrust,
    ProductDefinitionApprovalState,
    ProductDefinitionDecisionRequest,
    ProductDefinitionRequest,
    ProductDefinitionResponse,
    ProductDefinitionState,
    ProductDefinitionStatus,
    ProductDefinitionSummary,
    ProductRequirement,
    ProductUserStory,
    RoadmapPhase,
    StrictProductModel,
    SuccessMetric,
)

__all__ = [
    "EstimateBasis",
    "EstimateNumber",
    "GeneratedTrust",
    "ProductDefinitionApprovalState",
    "ProductDefinitionDecisionRequest",
    "ProductDefinitionRequest",
    "ProductDefinitionResponse",
    "ProductDefinitionState",
    "ProductDefinitionStatus",
    "ProductDefinitionSummary",
    "ProductRequirement",
    "ProductUserStory",
    "RoadmapPhase",
    "StrictProductModel",
    "SuccessMetric",
]

LIFECYCLE_PHASES = lifecycle.LIFECYCLE_PHASES
PHASE_DEPARTMENT = lifecycle.PHASE_DEPARTMENT

#: Routing confidence levels (Story 8.2: deterministic, two tiers).
RoutingConfidence = Literal["high", "low"]

#: Trust classification for generated artifacts.
TrustLevel = Literal["generated", "trusted", "verified-tool-call", "fallback"]

# Structured Idea Team validation vocabulary.  These are deliberately closed
# sets so an assessment cannot be mistaken for legal certainty.
ValidationState = Literal[
    "unknown", "initializing", "running", "completed", "failed", "incomplete", "cancelled"
]
PatentabilityOutcome = Literal["likely", "uncertain", "unlikely"]
FtoRisk = Literal["low", "moderate", "high", "unknown"]

#: Status a work item is created with. Lifecycle transitions beyond
#: ``new`` are Story 8.3 scope — 8.2 only ever creates items.
STATUS_NEW = "new"

#: Agent id of the Chief of Staff, who owns every submitted work item.
OWNER_AGENT_ID = "chief_of_staff"


class RoutingDecision(BaseModel):
    """The explainable routing decision attached to a work item (AC-3)."""

    department_id: str
    decided_by: str
    decided_at: str
    confidence: RoutingConfidence
    reasoning: str
    alternatives: list[str] = Field(default_factory=list)


class WorkItem(BaseModel):
    """A submitted work item together with its routing decision."""

    work_item_id: str
    org_id: str
    title: str
    description: str
    status: str
    owner_agent_id: str
    source: str
    department_id: str
    routing: RoutingDecision
    created_at: str
    updated_at: str
    template_id: str | None = None
    product_definition: ProductDefinitionStatus | None = None


class SubmitWorkItemRequest(BaseModel):
    """Request body for POST /api/work-items."""

    title: str
    description: str = Field(default="", max_length=5000)
    org_id: str | None = Field(default=None, max_length=64)
    department: str | None = Field(default=None, max_length=64)
    source: str | None = Field(default=None, max_length=64)
    template_id: str | None = Field(default=None, max_length=64)


class LifecycleEvent(BaseModel):
    """A persisted lifecycle transition or synthesized creation event."""

    event_id: str
    work_item_id: str
    event_type: Literal["created", "transition", "handoff", "reassignment", "escalation"]
    from_status: str
    to_status: str
    from_department: str
    to_department: str
    decided_by: str
    decided_at: str
    confidence: RoutingConfidence
    reasoning: str
    alternatives: list[str] = Field(default_factory=list)


class OrgAlert(BaseModel):
    """A raised alert for a work item stuck in one phase (Story 9.2)."""

    alert_id: str
    org_id: str
    work_item_id: str
    phase: str
    reason: str
    raised_at: str


class TransitionWorkItemRequest(BaseModel):
    """Request body for advancing a work item through its lifecycle."""

    status: str = Field(..., min_length=1, max_length=50)
    reasoning: str = Field(default="", max_length=2000)
    decided_by: str = Field(default=OWNER_AGENT_ID, max_length=64)


class DecisionRecord(BaseModel):
    decision_id: str
    work_item_id: str
    agent_id: str
    decision_type: Literal["routing", "transition", "handoff", "review"]
    reasoning: str
    evidence: list[str] = Field(default_factory=list)
    confidence: RoutingConfidence
    alternatives: list[str] = Field(default_factory=list)
    decided_at: str


class RecordDecisionRequest(BaseModel):
    work_item_id: str
    agent_id: str
    decision_type: Literal["routing", "transition", "handoff", "review"]
    reasoning: str = Field(..., min_length=1)

    @field_validator("reasoning")
    @classmethod
    def _reasoning_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("reasoning must not be blank")
        return value
    evidence: list[str] = Field(default_factory=list)
    confidence: RoutingConfidence
    alternatives: list[str] = Field(default_factory=list)


class WorkflowTemplate(BaseModel):
    """Persisted workflow template (Story 9.3)."""

    template_id: str
    org_id: str
    name: str
    source_work_item_id: str
    phases: list[str]
    departments: list[str]
    usage_count: int
    created_at: str
    last_used_at: str | None


class SaveTemplateRequest(BaseModel):
    """Request body for saving a work item as a template."""

    name: str = Field(..., min_length=1, max_length=200)


class ReplayTemplateRequest(BaseModel):
    """Request body for replaying a template."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)


class AccuracyReview(BaseModel):
    """A human accuracy review recorded against a work item (Story 10.3)."""

    review_id: str
    work_item_id: str
    reviewer: str
    accuracy_score: int
    summary: str
    flagged_for_review: bool
    reviewed_at: str


class AccuracyReviewRequest(BaseModel):
    """Request body for POST /api/work-items/{work_item_id}/reviews."""

    reviewer: str = Field(default="user", min_length=1, max_length=64)
    accuracy_score: int = Field(..., ge=0, le=100)
    summary: str = Field(..., min_length=1)

    @field_validator("summary")
    @classmethod
    def _summary_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("summary must not be blank")
        return value


class NoveltyAssessmentSummary(BaseModel):
    """A provider-supplied, evidence-backed novelty decision-support summary."""

    model_config = ConfigDict(extra="forbid")

    novelty_score: StrictInt = Field(..., ge=1, le=10)
    patentability_score: StrictInt = Field(..., ge=1, le=10)
    patentability_outcome: PatentabilityOutcome
    fto_risk: FtoRisk
    fto_analysis: str = Field(..., min_length=1)
    confidence: StrictInt = Field(..., ge=1, le=10)
    rationale: str = Field(..., min_length=1)
    prior_art_refs: list[str] = Field(..., min_length=1)
    source_refs: list[str] = Field(..., min_length=1)
    provenance: str = Field(..., min_length=1)
    agent_id: str = Field(..., min_length=1)
    assessed_at: str = Field(..., min_length=1)
    artifact_name: Literal["novelty-assessment"] = "novelty-assessment"
    artifact_version: int | None = Field(default=None, ge=1)

    @field_validator(
        "fto_analysis", "rationale", "provenance", "agent_id", "assessed_at", mode="before"
    )
    @classmethod
    def _non_blank(cls, value: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()

    @field_validator("prior_art_refs", "source_refs")
    @classmethod
    def _refs_not_blank(cls, value: list[str]) -> list[str]:
        if not value or any(not isinstance(ref, str) or not ref.strip() for ref in value):
            raise ValueError("references must contain non-empty strings")
        return [ref.strip() for ref in value]

    @field_validator("assessed_at")
    @classmethod
    def _timestamp_is_valid(cls, value: str) -> str:
        try:
            datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("assessed_at must be an ISO timestamp") from exc
        return value


class ValidationStatus(BaseModel):
    """Persisted validation lifecycle state exposed by work-item APIs."""

    state: ValidationState
    idea_id: str
    work_item_id: str | None = None
    expected_artifacts: list[str] = Field(default_factory=lambda: ["novelty-assessment"])
    completed_artifacts: list[str] = Field(default_factory=list)
    error: str | None = None
    retryable: bool | None = None
    updated_at: float | None = None
    summary: NoveltyAssessmentSummary | None = None
    artifact: dict[str, object] | None = None


class NoveltyValidationRequest(BaseModel):
    """Optional trigger controls for an Idea Team novelty validation run."""

    agent_id: str = Field(default="idea-team-validator", min_length=1, max_length=100)
    time_budget_sec: int | None = Field(default=None, ge=1, le=3600)


class NoveltyValidationResponse(BaseModel):
    """Response returned after triggering or reading novelty validation."""

    work_item_id: str
    idea_id: str | None
    validation: ValidationStatus
    lifecycle_status: str | None = None
