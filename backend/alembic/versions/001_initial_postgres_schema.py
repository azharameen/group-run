"""Initial PostgreSQL schema — all domain tables.

Revision ID: 001
Revises: (none — this is the root migration)
Create Date: 2026-08-24

This migration creates the complete initial schema for the Companion backend.
It replaces all inline CREATE TABLE statements that previously lived inside
Python repository files. Every subsequent schema change MUST be a new
Alembic migration script — never modify this file.

Upgrade:   Creates all tables and indexes.
Downgrade: Drops all tables in reverse dependency order.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─ organizations ───────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("org_id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )

    # ─ departments ───────────────────────────────────────────────────────
    op.create_table(
        "departments",
        sa.Column("org_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("department_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="idle"),
    )

    # ─ teams ─────────────────────────────────────────────────────────────
    op.create_table(
        "teams",
        sa.Column("org_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("department_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("team_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="idle"),
    )

    # ─ agents ─────────────────────────────────────────────────────────────
    op.create_table(
        "agents",
        sa.Column("org_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("agent_id", sa.String(), nullable=False, primary_key=True),
        sa.Column("department_id", sa.String(), nullable=True),
        sa.Column("team_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="idle"),
    )

    # ─ work_items ────────────────────────────────────────────────────────
    op.create_table(
        "work_items",
        sa.Column("work_item_id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
        sa.Column("owner_agent_id", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="api"),
        sa.Column("department_id", sa.String(), nullable=False, server_default="ideation"),
        sa.Column("template_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_work_items_org_created", "work_items", ["org_id", "created_at"])

    # ─ routing_decisions ────────────────────────────────────────────────
    op.create_table(
        "routing_decisions",
        sa.Column("work_item_id", sa.String(), primary_key=True),
        sa.Column("department_id", sa.String(), nullable=False),
        sa.Column("decided_by", sa.String(), nullable=False),
        sa.Column("decided_at", sa.String(), nullable=False),
        sa.Column("confidence", sa.String(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("alternatives", sa.Text(), nullable=False, server_default="[]"),
    )

    # ─ lifecycle_events ────────────────────────────────────────────────
    op.create_table(
        "lifecycle_events",
        sa.Column("event_id", sa.String(), primary_key=True),
        sa.Column("work_item_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("from_status", sa.String(), nullable=False),
        sa.Column("to_status", sa.String(), nullable=False),
        sa.Column("from_department", sa.String(), nullable=False),
        sa.Column("to_department", sa.String(), nullable=False),
        sa.Column("decided_by", sa.String(), nullable=False),
        sa.Column("decided_at", sa.String(), nullable=False),
        sa.Column("confidence", sa.String(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("alternatives", sa.Text(), nullable=False, server_default="[]"),
    )
    op.create_index("idx_lifecycle_events_item_time", "lifecycle_events", ["work_item_id", "decided_at"])

    # ─ decisions ───────────────────────────────────────────────────────────
    op.create_table(
        "decisions",
        sa.Column("decision_id", sa.String(), primary_key=True),
        sa.Column("work_item_id", sa.String(), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("decision_type", sa.String(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("confidence", sa.String(), nullable=False),
        sa.Column("alternatives", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("decided_at", sa.String(), nullable=False),
    )
    op.create_index("idx_decisions_item_time", "decisions", ["work_item_id", "decided_at"])
    op.create_index("idx_decisions_agent_time", "decisions", ["agent_id", "decided_at"])

    # ─ org_alerts ─────────────────────────────────────────────────────────
    op.create_table(
        "org_alerts",
        sa.Column("alert_id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("work_item_id", sa.String(), nullable=False),
        sa.Column("phase", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("raised_at", sa.String(), nullable=False),
    )
    op.create_unique_constraint(
        "idx_org_alerts_dedupe", "org_alerts", ["org_id", "work_item_id", "phase"]
    )

    # ─ workflow_templates ────────────────────────────────────────────────
    op.create_table(
        "workflow_templates",
        sa.Column("template_id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("source_work_item_id", sa.String(), nullable=False),
        sa.Column("phases", sa.Text(), nullable=False),
        sa.Column("departments", sa.Text(), nullable=False),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("last_used_at", sa.String(), nullable=True),
    )
    op.create_index("idx_workflow_templates_org", "workflow_templates", ["org_id"])

    # ─ accuracy_reviews ────────────────────────────────────────────────
    op.create_table(
        "accuracy_reviews",
        sa.Column("review_id", sa.String(), primary_key=True),
        sa.Column("work_item_id", sa.String(), nullable=False),
        sa.Column("reviewer", sa.String(), nullable=False),
        sa.Column("accuracy_score", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("flagged_for_review", sa.Boolean(), nullable=False),
        sa.Column("reviewed_at", sa.String(), nullable=False),
    )
    op.create_index("idx_accuracy_reviews_item_time", "accuracy_reviews", ["work_item_id", "reviewed_at"])

    # ─ interrupts ─────────────────────────────────────────────────────────
    op.create_table(
        "interrupts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("thread_id", sa.String(), nullable=False),
        sa.Column("tool_name", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("tool_input", sa.Text(), nullable=True, server_default="{}"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("decision", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reasoning", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.String(), nullable=True),
        sa.Column("decided_at", sa.String(), nullable=True),
        sa.Column("confidence", sa.String(), nullable=True),
        sa.Column("alternatives", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )

    # ─ thread_metadata ─────────────────────────────────────────────────
    op.create_table(
        "thread_metadata",
        sa.Column("thread_id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False, server_default="New Chat"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("idea_id", sa.String(), nullable=True),
        sa.Column("tags", sa.Text(), nullable=True, server_default="[]"),
        sa.Column("agent_names", sa.Text(), nullable=True, server_default="[]"),
    )
    op.create_index("idx_thread_metadata_updated", "thread_metadata", ["updated_at"])


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index("idx_thread_metadata_updated", table_name="thread_metadata")
    op.drop_table("thread_metadata")
    op.drop_table("interrupts")
    op.drop_index("idx_accuracy_reviews_item_time", table_name="accuracy_reviews")
    op.drop_table("accuracy_reviews")
    op.drop_index("idx_workflow_templates_org", table_name="workflow_templates")
    op.drop_table("workflow_templates")
    op.drop_constraint("idx_org_alerts_dedupe", "org_alerts", type_="unique")
    op.drop_table("org_alerts")
    op.drop_index("idx_decisions_agent_time", table_name="decisions")
    op.drop_index("idx_decisions_item_time", table_name="decisions")
    op.drop_table("decisions")
    op.drop_index("idx_lifecycle_events_item_time", table_name="lifecycle_events")
    op.drop_table("lifecycle_events")
    op.drop_table("routing_decisions")
    op.drop_index("idx_work_items_org_created", table_name="work_items")
    op.drop_table("work_items")
    op.drop_table("agents")
    op.drop_table("teams")
    op.drop_table("departments")
    op.drop_table("organizations")
