"""Tests for PostgreSQL URL normalization helpers."""

from app.db.url import normalize_postgres_url


def test_normalize_postgres_url_rewrites_driver_and_encodes_password():
    url = normalize_postgres_url(
        "postgresql+asyncpg://postgres:secret@db.example.com:5432/app_db",
        drivername="postgresql+psycopg",
    )

    assert url.startswith("postgresql+psycopg://postgres:")
    assert "@db.example.com:5432/app_db" in url


def test_normalize_postgres_url_accepts_quoted_plain_urls():
    url = normalize_postgres_url(
        '"postgresql://postgres:secret@localhost:5432/app_db"',
        drivername="postgresql+asyncpg",
    )

    assert url == "postgresql+asyncpg://postgres:secret@localhost:5432/app_db"
