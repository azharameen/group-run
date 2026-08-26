"""Strict Story 11.3 product-definition contracts."""

import math
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator

GeneratedTrust = Literal["generated"]
ProductDefinitionState = Literal[
    "unknown", "initializing", "running", "completed", "failed", "incomplete", "cancelled"
]
ProductDefinitionApprovalState = Literal["unreviewed", "rejected", "approved"]
EstimateNumber = StrictInt | StrictFloat


class StrictProductModel(BaseModel):
    """Base contract that rejects provider fields outside the schema."""

    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def _reject_blank_strings(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            raise ValueError("string values must not be blank")
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            if any(isinstance(item, str) and not item.strip() for item in value):
                raise ValueError("list string values must not be blank")
            return [item.strip() if isinstance(item, str) else item for item in value]
        return value


class ProductRequirement(StrictProductModel):
    """One evidence-backed product requirement."""

    requirement_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    priority: Literal["must", "should", "could", "wont"]
    evidence_refs: list[str] = Field(..., min_length=1)


class ProductUserStory(StrictProductModel):
    """One product user story with testable acceptance criteria."""

    story_id: str = Field(..., min_length=1)
    persona: str = Field(..., min_length=1)
    need: str = Field(..., min_length=1)
    benefit: str = Field(..., min_length=1)
    acceptance_criteria: list[str] = Field(..., min_length=1)
    evidence_refs: list[str] = Field(..., min_length=1)


class EstimateBasis(StrictProductModel):
    """Basis and assumptions supporting one roadmap estimate."""

    method: str = Field(..., min_length=1)
    assumptions: list[str] = Field(..., min_length=1)
    evidence_refs: list[str] = Field(..., min_length=1)


class RoadmapPhase(StrictProductModel):
    """A roadmap phase with generated effort and compute-cost estimates."""

    phase: str = Field(..., min_length=1)
    objective: str = Field(..., min_length=1)
    deliverables: list[str] = Field(..., min_length=1)
    agent_hours: EstimateNumber = Field(..., gt=0)
    projected_compute_cost: EstimateNumber = Field(..., ge=0)
    estimate_basis: EstimateBasis
    estimate_trust: GeneratedTrust = "generated"

    @field_validator("agent_hours", "projected_compute_cost")
    @classmethod
    def _estimates_must_be_finite(cls, value: EstimateNumber) -> EstimateNumber:
        if not math.isfinite(float(value)):
            raise ValueError("estimates must be finite numbers")
        return value


class SuccessMetric(StrictProductModel):
    """A measurable outcome backed by the validated evidence packet."""

    name: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    measurement: str = Field(..., min_length=1)
    evidence_refs: list[str] = Field(..., min_length=1)


class ProductDefinitionSummary(StrictProductModel):
    """Canonical structured product definition persisted as one artifact."""

    requirements: list[ProductRequirement] = Field(..., min_length=1)
    user_stories: list[ProductUserStory] = Field(..., min_length=1)
    roadmap: list[RoadmapPhase] = Field(..., min_length=1)
    success_metrics: list[SuccessMetric] = Field(..., min_length=1)
    confidence: StrictInt = Field(..., ge=1, le=10)
    reasoning: str = Field(..., min_length=1)
    alternatives: list[str] = Field(..., min_length=1)
    evidence_refs: list[str] = Field(..., min_length=1)
    provenance: str = Field(..., min_length=1)
    agent_id: str = Field(..., min_length=1)
    generated_at: str = Field(..., min_length=1)
    trust: GeneratedTrust = "generated"
    artifact_name: Literal["product-definition"] = "product-definition"
    artifact_version: int | None = Field(default=None, ge=1)

    @field_validator("generated_at")
    @classmethod
    def _timestamp_is_timezone_aware(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError("generated_at must include a timezone")
        return value


class ProductDefinitionStatus(BaseModel):
    """Persisted generation state and review summary."""

    state: ProductDefinitionState
    idea_id: str
    work_item_id: str | None = None
    expected_artifacts: list[str] = Field(default_factory=lambda: ["product-definition"])
    completed_artifacts: list[str] = Field(default_factory=list)
    error: str | None = None
    retryable: bool | None = None
    updated_at: float | None = None
    summary: ProductDefinitionSummary | None = None
    artifact: dict[str, object] | None = None
    approval_state: ProductDefinitionApprovalState = "unreviewed"
    approval_decision: dict[str, object] | None = None

    @field_validator("expected_artifacts", "completed_artifacts")
    @classmethod
    def _artifact_names_must_be_nonblank(cls, value: list[str]) -> list[str]:
        if any(not isinstance(item, str) or not item.strip() for item in value):
            raise ValueError("artifact names must contain only non-blank strings")
        return [item.strip() for item in value]


class ProductDefinitionRequest(BaseModel):
    """Optional controls for a bounded Product Team generation."""

    agent_id: str = Field(default="product-team", min_length=1, max_length=100)
    time_budget_sec: int | None = Field(default=None, ge=1, le=3600)

    @field_validator("agent_id")
    @classmethod
    def _agent_id_must_be_nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("agent_id must not be blank")
        return value.strip()


class ProductDefinitionDecisionRequest(BaseModel):
    """Explicit Chief of Staff decision against one exact artifact revision.

    ``actor_id`` is retained as a required legacy wire field for existing
    clients. The service validates it against the server-owned approval role
    and never uses the client value for audit attribution.
    """

    actor_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Legacy compatibility field; server-owned identity is recorded.",
    )
    decision: Literal["approve", "reject"]
    artifact_version: int = Field(..., ge=1)
    reasoning: str = Field(..., min_length=1, max_length=2000)
    alternatives: list[str] = Field(default_factory=list)

    @field_validator("actor_id", "reasoning")
    @classmethod
    def _decision_strings_must_be_nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("decision strings must not be blank")
        return value.strip()

    @field_validator("alternatives")
    @classmethod
    def _alternatives_must_be_nonblank(cls, value: list[str]) -> list[str]:
        if any(not isinstance(item, str) or not item.strip() for item in value):
            raise ValueError("alternatives must contain only non-blank strings")
        return [item.strip() for item in value]


class ProductDefinitionResponse(BaseModel):
    """Generation/read response including the unchanged lifecycle phase."""

    work_item_id: str
    idea_id: str | None
    product_definition: ProductDefinitionStatus
    lifecycle_status: str | None = None
