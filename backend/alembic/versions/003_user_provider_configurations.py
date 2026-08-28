"""Scope provider configurations to Firebase users and encrypt credentials.

Revision ID: 003
Revises: 002
"""

from __future__ import annotations

import os
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _offline() -> bool:
    """True when running offline (e.g. ``alembic upgrade head --sql`` dry-run).

    Data migrations require a live connection; DDL still renders to SQL.
    In --sql mode the context bind is a mock that cannot return results,
    so ``op.get_bind() is None`` is not a reliable check here.
    """
    return context.is_offline_mode()


def _encrypt_legacy_credentials() -> None:
    """Encrypt existing rows or fail explicitly rather than retain plaintext."""
    if _offline():
        return
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT provider_id, credentials FROM provider_configs WHERE credentials IS NOT NULL")
    ).mappings()
    rows = list(rows)
    if not rows:
        return

    key = os.environ.get("PROVIDER_CREDENTIAL_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required to migrate existing provider credentials"
        )
    from cryptography.fernet import Fernet

    cipher = Fernet(key.encode())
    for row in rows:
        encrypted = cipher.encrypt(row["credentials"].encode()).decode()
        connection.execute(
            sa.text(
                "UPDATE provider_configs SET encrypted_credentials = :credentials "
                "WHERE provider_id = :provider_id"
            ),
            {"credentials": encrypted, "provider_id": row["provider_id"]},
        )


def _deduplicate_legacy_names() -> None:
    """Make names unique before assigning all legacy rows to one owner."""
    if _offline():
        return
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT provider_id, name FROM provider_configs "
            "ORDER BY name, provider_id"
        )
    ).mappings()
    used_names: set[str] = set()

    for row in rows:
        name = str(row["name"])
        resolved_name = name
        if resolved_name in used_names:
            resolved_name = f"{name} ({row['provider_id']})"
            suffix = 2
            while resolved_name in used_names:
                resolved_name = f"{name} ({row['provider_id']}-{suffix})"
                suffix += 1
            connection.execute(
                sa.text(
                    "UPDATE provider_configs SET name = :name "
                    "WHERE provider_id = :provider_id"
                ),
                {"name": resolved_name, "provider_id": row["provider_id"]},
            )
        used_names.add(resolved_name)


def upgrade() -> None:
    op.drop_index("uq_provider_configs_active", table_name="provider_configs")
    op.add_column("provider_configs", sa.Column("user_id", sa.String(), nullable=True))
    op.add_column(
        "provider_configs", sa.Column("encrypted_credentials", sa.Text(), nullable=True)
    )
    op.add_column(
        "provider_configs",
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _encrypt_legacy_credentials()
    _deduplicate_legacy_names()
    if not _offline():
        op.execute(
            "UPDATE provider_configs SET user_id = 'legacy-unassigned', is_enabled = is_active"
        )
    op.alter_column("provider_configs", "user_id", nullable=False)
    if not _offline():
        op.execute("UPDATE provider_configs SET provider = 'google' WHERE provider = 'gemini'")
    op.drop_column("provider_configs", "credentials")
    op.drop_column("provider_configs", "model")
    op.drop_column("provider_configs", "is_active")
    op.create_unique_constraint(
        "uq_provider_configs_user_name", "provider_configs", ["user_id", "name"]
    )
    op.create_index(
        "idx_provider_configs_user_enabled", "provider_configs", ["user_id", "is_enabled"]
    )
    op.create_table(
        "provider_default_models",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("provider_id", sa.String(), nullable=False),
        sa.Column("model_id", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_table(
        "provider_execution_leases",
        sa.Column("provider_id", sa.String(), primary_key=True),
        sa.Column("execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.add_column("thread_metadata", sa.Column("owner_uid", sa.String(), nullable=True))
    op.add_column("thread_metadata", sa.Column("provider_id", sa.String(), nullable=True))
    op.add_column("thread_metadata", sa.Column("model_id", sa.String(), nullable=True))
    op.create_index("idx_thread_metadata_owner_uid", "thread_metadata", ["owner_uid"])


def downgrade() -> None:
    raise RuntimeError(
        "Migration 003 is intentionally irreversible: downgrading would require "
        "writing encrypted provider credentials into a legacy plaintext column."
    )
