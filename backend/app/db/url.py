"""Database URL normalization helpers."""

from __future__ import annotations

import socket

from sqlalchemy.engine import make_url


def normalize_postgres_dsn(raw_url: str) -> str:
    """Return a normalized plain PostgreSQL DSN suitable for psycopg.

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

    url = make_url(cleaned).set(drivername="postgresql")
    host = url.host
    if host:
        try:
            for family, _, _, _, sockaddr in socket.getaddrinfo(host, url.port or 5432, socket.AF_INET):
                if family == socket.AF_INET and sockaddr:
                    ipv4 = sockaddr[0]
                    url = url.set(query={**url.query, "hostaddr": ipv4})
                    break
        except OSError:
            pass
    return url.render_as_string(hide_password=False)


def normalize_sqlalchemy_postgres_url(raw_url: str, *, drivername: str) -> str:
    """Return a normalized PostgreSQL URL for SQLAlchemy engine creation."""

    url = make_url(normalize_postgres_dsn(raw_url)).set(drivername=drivername)
    return url.render_as_string(hide_password=False)
