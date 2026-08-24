"""Tests for PostgreSQL URL normalization helpers."""

from app.db.url import normalize_postgres_dsn, normalize_sqlalchemy_postgres_url


def test_normalize_postgres_dsn_rewrites_driver_and_encodes_password():
    url = normalize_postgres_dsn(
        "postgresql+asyncpg://postgres:secret@db.example.com:5432/app_db",
    )

    assert url == "postgresql://postgres:secret@db.example.com:5432/app_db"
    assert "@db.example.com:5432/app_db" in url


def test_normalize_sqlalchemy_postgres_url_accepts_quoted_plain_urls():
    url = normalize_sqlalchemy_postgres_url(
        '"postgresql://postgres:secret@localhost:5432/app_db"',
        drivername="postgresql+asyncpg",
    )

    assert url == "postgresql+asyncpg://postgres:secret@localhost:5432/app_db"
