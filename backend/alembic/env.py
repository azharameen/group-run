"""Alembic migration environment.

Reads DATABASE_DIRECT_URL from the environment for all migration runs.
The direct connection URL must use the psycopg (v3) synchronous driver
(postgresql+psycopg://...) — Alembic DDL requires a persistent connection,
not a PgBouncer transaction-pooled URL.

Two run modes are supported:
- Offline (--sql):  Emits SQL to stdout without connecting.
- Online (default): Connects via synchronous psycopg, runs migrations.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# ── Make the backend package importable from the alembic directory ────────
_backend_dir = Path(__file__).resolve().parent.parent  # .../backend/
sys.path.insert(0, str(_backend_dir))

from app.db.models import Base  # noqa: E402  — must come after sys.path insert

# ── Alembic Config object (provides access to alembic.ini values) ────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_url() -> str:
    """Return DATABASE_DIRECT_URL from the environment.

    Falls back to DATABASE_URL if DIRECT is not set (useful for local
    dev when both point at the same instance).
    """
    url = os.environ.get("DATABASE_DIRECT_URL") or os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_DIRECT_URL (or DATABASE_URL) must be set for Alembic migrations. "
            "Check your .env file or CI secrets."
        )
    # Convert asyncpg URL to psycopg (sync) if caller accidentally set the async URL.
    return url.replace("+asyncpg", "+psycopg").replace("postgresql+psycopg2", "postgresql+psycopg")


def run_migrations_offline() -> None:
    """Emit migration SQL to stdout without connecting to the DB."""
    url = _get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live PostgreSQL connection."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # no pooling — one connection per migration run
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,      # detect column type changes
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
