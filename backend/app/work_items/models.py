"""Pydantic models for work items and routing decisions (Story 8.2).

Defines the shape of a submitted work item, the explainable routing
decision recorded by the Chief of Staff, and the request model served
by the /api/work-items endpoints.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from . import lifecycle

LIFECYCLE_PHASES = lifecycle.LIFECYCLE_PHASES
PHASE_DEPARTMENT = lifecycle.PHASE_DEPARTMENT

#: Routing confidence levels (Story 8.2: deterministic, two tiers).
RoutingConfidence = Literal["high", "low"]

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


class SubmitWorkItemRequest(BaseModel):
    """Request body for POST /api/work-items."""

    title: str
    description: str = Field(default="", max_length=5000)
    org_id: str | None = Field(default=None, max_length=64)
    department: str | None = Field(default=None, max_length=64)
    source: str | None = Field(default=None, max_length=64)


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
