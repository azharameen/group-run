"""Tests for PostgreSQL URL normalization helpers."""

import socket

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


def test_normalize_postgres_dsn_prefers_ipv4_hostaddr(monkeypatch):
    def fake_getaddrinfo(host, port, family):
        assert family == socket.AF_INET
        return [
            (socket.AF_INET, None, None, None, ("203.0.113.10", port)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    url = normalize_postgres_dsn("postgresql://postgres:secret@db.example.com:5432/app_db")

    assert "hostaddr=203.0.113.10" in url
