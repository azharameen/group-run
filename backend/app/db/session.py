"""SQLAlchemy async engine, session factory, and FastAPI DB dependency.

This module is the single source of all database connectivity for the
application. All repositories and the LangGraph checkpointer share the
same engine and its underlying connection pool.

Environment-driven provider swapping
-------------------------------------
Changing the database provider (Supabase -> AWS RDS -> Neon -> local Postgres)
requires only updating DATABASE_URL and DATABASE_DIRECT_URL in the environment.
No application code needs to change.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import settings
from .url import normalize_sqlalchemy_postgres_url

_logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_engine_loop: asyncio.AbstractEventLoop | None = None
_engine_lock = asyncio.Lock()


def get_engine() -> AsyncEngine:
    """Return the shared async engine, creating it once on first call.

    The engine is a module-level singleton that owns the connection pool.
    Call ``await dispose_engine()`` during application shutdown to release
    all pooled connections cleanly.
    """
    global _engine, _session_factory, _engine_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _engine is not None and current_loop is not None and _engine_loop is not current_loop:
        _engine = None
        _session_factory = None

    if _engine is None:
        # Supabase's transaction pooler (PgBouncer) does not preserve
        # prepared statements between transactions.
        connect_args: dict = {"statement_cache_size": 0}
        ssl_mode = (settings.db_ssl_mode or "").lower()
        if ssl_mode in ("require", "verify-ca", "verify-full"):
            connect_args["ssl"] = ssl_mode

        _engine = create_async_engine(
            normalize_sqlalchemy_postgres_url(settings.database_url, drivername="postgresql+asyncpg"),
            pool_size=settings.db_pool_min_size,
            max_overflow=max(0, settings.db_pool_max_size - settings.db_pool_min_size),
            pool_timeout=settings.db_pool_timeout,
            pool_pre_ping=True,  # discard stale connections before handing them out
            connect_args=connect_args,
            echo=False,
        )
        _engine_loop = current_loop
        _logger.info(
            "PostgreSQL async engine created (pool_size=%d, max_overflow=%d)",
            settings.db_pool_min_size,
            max(0, settings.db_pool_max_size - settings.db_pool_min_size),
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the shared async session factory."""
    global _session_factory
    engine = get_engine()
    if _session_factory is None or getattr(_session_factory, "kw", {}).get("bind") is not engine:
        _session_factory = async_sessionmaker(
            engine,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency -- yields one AsyncSession per request.

    The session is automatically committed and closed when the request
    completes, or rolled back on any unhandled exception.
    """
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            try:
                await session.rollback()
            except Exception as rollback_err:  # noqa: BLE001
                _logger.error("Failed to rollback DB session: %s", rollback_err)
            raise


async def dispose_engine() -> None:
    """Dispose active connection pool connections cleanly."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _logger.info("PostgreSQL async engine disposed")


def reset_engine() -> None:
    """Reset the engine and session factory singletons (test / hot-reload hook)."""
    global _engine, _session_factory
    _engine = None
    _session_factory = None
