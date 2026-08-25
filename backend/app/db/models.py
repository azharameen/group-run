"""SQLAlchemy ORM models -- canonical schema for all domain entities.

These models are the source of truth for database table structure.
Alembic reads them (via ``Base.metadata``) to generate migration scripts.
Do NOT add raw DDL in repository files -- all schema changes go through
a new Alembic migration in ``backend/alembic/versions/``.
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# ---------------------------------------------------------------------------
# Organization hierarchy
# ---------------------------------------------------------------------------


class OrganizationModel(Base):
    """Top-level organization record."""

    __tablename__ = "organizations"

    org_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, server_default="")
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class DepartmentModel(Base):
    """Department belonging to an organization."""

    __tablename__ = "departments"

    org_id = Column(String, nullable=False, primary_key=True)
    department_id = Column(String, nullable=False, primary_key=True)
    name = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default="idle")


class TeamModel(Base):
    """Team belonging to a department."""

    __tablename__ = "teams"

    org_id = Column(String, nullable=False, primary_key=True)
    department_id = Column(String, nullable=False, primary_key=True)
    team_id = Column(String, nullable=False, primary_key=True)
    name = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default="idle")


class AgentModel(Base):
    """Agent member of an organization (optionally scoped to dept/team)."""

    __tablename__ = "agents"

    org_id = Column(String, nullable=False, primary_key=True)
    agent_id = Column(String, nullable=False, primary_key=True)
    department_id = Column(String, nullable=True)
    team_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default="idle")


# ---------------------------------------------------------------------------
# Work items & related
# ---------------------------------------------------------------------------


class WorkItemModel(Base):
    """A unit of organizational work."""

    __tablename__ = "work_items"

    work_item_id = Column(String, primary_key=True)
    org_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False, server_default="")
    status = Column(String, nullable=False, server_default="new")
    owner_agent_id = Column(String, nullable=False)
    source = Column(String, nullable=False, server_default="api")
    department_id = Column(String, nullable=False, server_default="ideation")
    template_id = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    __table_args__ = (
        Index("idx_work_items_org_created", "org_id", "created_at"),
    )


class RoutingDecisionModel(Base):
    """Routing decision for a work item (one-to-one)."""

    __tablename__ = "routing_decisions"

    work_item_id = Column(String, primary_key=True)
    department_id = Column(String, nullable=False)
    decided_by = Column(String, nullable=False)
    decided_at = Column(String, nullable=False)
    confidence = Column(String, nullable=False)
    reasoning = Column(Text, nullable=False)
    alternatives = Column(Text, nullable=False, server_default="[]")


class LifecycleEventModel(Base):
    """Audit trail of work item state transitions."""

    __tablename__ = "lifecycle_events"

    event_id = Column(String, primary_key=True)
    work_item_id = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    from_status = Column(String, nullable=False)
    to_status = Column(String, nullable=False)
    from_department = Column(String, nullable=False)
    to_department = Column(String, nullable=False)
    decided_by = Column(String, nullable=False)
    decided_at = Column(String, nullable=False)
    confidence = Column(String, nullable=False)
    reasoning = Column(Text, nullable=False)
    alternatives = Column(Text, nullable=False, server_default="[]")

    __table_args__ = (
        Index("idx_lifecycle_events_item_time", "work_item_id", "decided_at"),
    )


class DecisionModel(Base):
    """Agent decision record (routing, review, escalation, etc.)."""

    __tablename__ = "decisions"

    decision_id = Column(String, primary_key=True)
    work_item_id = Column(String, nullable=False)
    agent_id = Column(String, nullable=False)
    decision_type = Column(String, nullable=False)
    reasoning = Column(Text, nullable=False)
    evidence = Column(Text, nullable=False, server_default="[]")
    confidence = Column(String, nullable=False)
    alternatives = Column(Text, nullable=False, server_default="[]")
    decided_at = Column(String, nullable=False)

    __table_args__ = (
        Index("idx_decisions_item_time", "work_item_id", "decided_at"),
        Index("idx_decisions_agent_time", "agent_id", "decided_at"),
    )


class OrgAlertModel(Base):
    """Escalation alert for a blocked/overloaded work item."""

    __tablename__ = "org_alerts"

    alert_id = Column(String, primary_key=True)
    org_id = Column(String, nullable=False)
    work_item_id = Column(String, nullable=False)
    phase = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    raised_at = Column(String, nullable=False)

    __table_args__ = (
        UniqueConstraint("org_id", "work_item_id", "phase", name="idx_org_alerts_dedupe"),
    )


class WorkflowTemplateModel(Base):
    """Reusable workflow template derived from a completed work item."""

    __tablename__ = "workflow_templates"

    template_id = Column(String, primary_key=True)
    org_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    source_work_item_id = Column(String, nullable=False)
    phases = Column(Text, nullable=False)
    departments = Column(Text, nullable=False)
    usage_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(String, nullable=False)
    last_used_at = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_workflow_templates_org", "org_id"),
    )


class AccuracyReviewModel(Base):
    """Human accuracy review of an agent-produced work item."""

    __tablename__ = "accuracy_reviews"

    review_id = Column(String, primary_key=True)
    work_item_id = Column(String, nullable=False)
    reviewer = Column(String, nullable=False)
    accuracy_score = Column(Integer, nullable=False)
    summary = Column(Text, nullable=False)
    flagged_for_review = Column(Boolean, nullable=False)
    reviewed_at = Column(String, nullable=False)

    __table_args__ = (
        Index("idx_accuracy_reviews_item_time", "work_item_id", "reviewed_at"),
    )


# ---------------------------------------------------------------------------
# Interrupts (HITL approvals)
# ---------------------------------------------------------------------------


class InterruptModel(Base):
    """Human-in-the-loop interrupt/approval record."""

    __tablename__ = "interrupts"

    id = Column(String, primary_key=True)
    thread_id = Column(String, nullable=False)
    tool_name = Column(String, nullable=False, server_default="unknown")
    tool_input = Column(Text, nullable=True, server_default="{}")
    message = Column(Text, nullable=False)
    status = Column(String, nullable=False, server_default="pending")
    decision = Column(String, nullable=True)
    reason = Column(Text, nullable=True)
    reasoning = Column(Text, nullable=True)
    decided_by = Column(String, nullable=True)
    decided_at = Column(String, nullable=True)
    confidence = Column(String, nullable=True)
    alternatives = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


# ---------------------------------------------------------------------------
# Thread metadata
# ---------------------------------------------------------------------------


class ThreadMetadataModel(Base):
    """LangGraph thread metadata (title, status, tags, etc.)."""

    __tablename__ = "thread_metadata"

    thread_id = Column(String, primary_key=True)
    title = Column(String, nullable=False, server_default="New Chat")
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default="active")
    idea_id = Column(String, nullable=True)
    tags = Column(Text, nullable=True, server_default="[]")
    agent_names = Column(Text, nullable=True, server_default="[]")

    __table_args__ = (
        Index("idx_thread_metadata_updated", "updated_at"),
    )


class ProviderConfigModel(Base):
    """App-wide LLM provider metadata and encrypted credentials."""

    __tablename__ = "provider_configs"

    provider_id = Column(String, primary_key=True)
    provider = Column(String, nullable=False)
    name = Column(String, nullable=False)
    endpoint = Column(String, nullable=False)
    model = Column(String, nullable=False)
    credentials_encrypted = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    __table_args__ = (
        Index(
            "uq_provider_configs_active",
            "is_active",
            unique=True,
            postgresql_where=is_active.is_(True),
        ),
    )
