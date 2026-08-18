"""Pydantic models for work items and routing decisions (Story 8.2).

Defines the shape of a submitted work item, the explainable routing
decision recorded by the Chief of Staff, and the request model served
by the /api/work-items endpoints.
"""

from typing import Literal

from pydantic import BaseModel, Field

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


class SubmitWorkItemRequest(BaseModel):
    """Request body for POST /api/work-items."""

    title: str
    description: str = ""
    org_id: str | None = None
    department: str | None = None
    source: str | None = None
