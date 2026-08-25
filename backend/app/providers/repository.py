"""PostgreSQL persistence for app-wide provider configurations."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from ..db.session import get_session_factory
from ..repositories.interfaces import IProviderRepository


def _now() -> str:
    return datetime.now(UTC).isoformat()


class ProviderRepository(IProviderRepository):
    async def list(self) -> list[dict[str, Any]]:
        async with get_session_factory()() as session:
            result = await session.execute(text(
                "SELECT provider_id, provider, name, endpoint, model, is_active, "
                "created_at, updated_at, (credentials IS NOT NULL) AS has_credentials "
                "FROM provider_configs ORDER BY created_at, provider_id"
            ))
            return [dict(row) for row in result.mappings()]

    async def get(self, provider_id: str, include_credentials: bool = False) -> dict[str, Any] | None:
        columns = "*" if include_credentials else (
            "provider_id, provider, name, endpoint, model, is_active, created_at, updated_at, "
            "(credentials IS NOT NULL) AS has_credentials"
        )
        async with get_session_factory()() as session:
            result = await session.execute(
                text(f"SELECT {columns} FROM provider_configs WHERE provider_id = :provider_id"),
                {"provider_id": provider_id},
            )
            row = result.mappings().one_or_none()
            return dict(row) if row else None

    async def save(self, values: dict[str, Any], provider_id: str | None = None) -> dict[str, Any]:
        provider_id = provider_id or str(uuid4())
        now = _now()
        async with get_session_factory()() as session:
            if values.get("is_active"):
                await session.execute(text("UPDATE provider_configs SET is_active = FALSE WHERE is_active = TRUE"))
            await session.execute(text(
                """
                INSERT INTO provider_configs
                    (provider_id, provider, name, endpoint, model, credentials, is_active, created_at, updated_at)
                VALUES (:provider_id, :provider, :name, :endpoint, :model, :credentials, :is_active, :created_at, :updated_at)
                ON CONFLICT (provider_id) DO UPDATE SET
                    provider = EXCLUDED.provider, name = EXCLUDED.name, endpoint = EXCLUDED.endpoint,
                    model = EXCLUDED.model, credentials = COALESCE(EXCLUDED.credentials, provider_configs.credentials),
                    is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at
                """
            ), {**values, "provider_id": provider_id, "created_at": now, "updated_at": now})
            await session.commit()
        return (await self.get(provider_id)) or {}

    async def delete(self, provider_id: str) -> bool:
        async with get_session_factory()() as session:
            result = await session.execute(
                text("DELETE FROM provider_configs WHERE provider_id = :provider_id"),
                {"provider_id": provider_id},
            )
            await session.commit()
            return bool(result.rowcount)

    async def activate(self, provider_id: str) -> dict[str, Any] | None:
        async with get_session_factory()() as session:
            result = await session.execute(
                text("SELECT provider_id FROM provider_configs WHERE provider_id = :provider_id"),
                {"provider_id": provider_id},
            )
            if result.scalar_one_or_none() is None:
                return None
            await session.execute(text("UPDATE provider_configs SET is_active = FALSE WHERE is_active = TRUE"))
            await session.execute(
                text("UPDATE provider_configs SET is_active = TRUE, updated_at = :updated_at WHERE provider_id = :provider_id"),
                {"provider_id": provider_id, "updated_at": _now()},
            )
            await session.commit()
        return await self.get(provider_id)
