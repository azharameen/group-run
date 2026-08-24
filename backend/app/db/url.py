"""Database URL normalization helpers."""

from __future__ import annotations

from sqlalchemy.engine import make_url


def normalize_postgres_url(raw_url: str, *, drivername: str) -> str:
    """Return a normalized PostgreSQL URL for the requested driver.

    The helper accepts common copy/paste variants from Supabase and local
    development:
    - quoted strings from .env files
    - postgres:// aliases
    - asyncpg / psycopg2 driver variants
    - passwords that need URL re-encoding
    """
    cleaned = raw_url.strip().strip('"').strip("'")
    if "://" not in cleaned:
        cleaned = f"postgresql://{cleaned}"

    cleaned = cleaned.replace("postgres://", "postgresql://")
    cleaned = cleaned.replace("postgresql+asyncpg://", "postgresql://")
    cleaned = cleaned.replace("postgresql+psycopg2://", "postgresql://")
    cleaned = cleaned.replace("postgresql+psycopg://", "postgresql://")

    url = make_url(cleaned).set(drivername=drivername)
    return url.render_as_string(hide_password=False)
