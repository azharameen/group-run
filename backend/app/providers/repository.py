"""PostgreSQL persistence for Firebase-user-owned provider configurations."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from ..db.session import get_session_factory


class ProviderExecutionActiveError(RuntimeError):
    """The provider cannot be deleted while an execution lease is active."""


def _now() -> str:
    return datetime.now(UTC).isoformat()


_SAFE_COLUMNS = (
    "provider_id, provider, name, endpoint, is_enabled, created_at, updated_at, "
    "(encrypted_credentials IS NOT NULL) AS has_credentials"
)


class ProviderRepository:
    """Persist provider records behind a required Firebase UID boundary."""

    async def list(self, user_id: str, enabled_only: bool = False) -> list[dict[str, Any]]:
        condition = "AND is_enabled = TRUE" if enabled_only else ""
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    f"SELECT {_SAFE_COLUMNS} FROM provider_configs "
                    f"WHERE user_id = :user_id {condition} ORDER BY created_at, provider_id"
                ),
                {"user_id": user_id},
            )
            return [dict(row) for row in result.mappings()]

    async def get(
        self, user_id: str, provider_id: str, include_credentials: bool = False
    ) -> dict[str, Any] | None:
        columns = (
            "provider_id, user_id, provider, name, endpoint, encrypted_credentials, is_enabled, "
            "created_at, updated_at"
            if include_credentials
            else _SAFE_COLUMNS
        )
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    f"SELECT {columns} FROM provider_configs "
                    "WHERE user_id = :user_id AND provider_id = :provider_id"
                ),
                {"user_id": user_id, "provider_id": provider_id},
            )
            row = result.mappings().one_or_none()
            return dict(row) if row else None

    async def save(
        self, user_id: str, values: dict[str, Any], provider_id: str | None = None
    ) -> dict[str, Any] | None:
        provider_id = provider_id or str(uuid4())
        now = _now()
        async with get_session_factory()() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO provider_configs
                        (provider_id, user_id, provider, name, endpoint, encrypted_credentials,
                         is_enabled, created_at, updated_at)
                    VALUES
                        (:provider_id, :user_id, :provider, :name, :endpoint, :encrypted_credentials,
                         :is_enabled, :created_at, :updated_at)
                    ON CONFLICT (provider_id) DO UPDATE SET
                        provider = EXCLUDED.provider, name = EXCLUDED.name,
                        endpoint = EXCLUDED.endpoint,
                        encrypted_credentials = COALESCE(
                            EXCLUDED.encrypted_credentials, provider_configs.encrypted_credentials
                        ),
                        is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at
                    WHERE provider_configs.user_id = EXCLUDED.user_id
                    """
                ),
                {
                    **values,
                    "provider_id": provider_id,
                    "user_id": user_id,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            await session.commit()
        return await self.get(user_id, provider_id)

    async def delete(self, user_id: str, provider_id: str) -> bool:
        async with get_session_factory()() as session:
            try:
                config = await session.execute(
                    text(
                        "SELECT provider_id FROM provider_configs "
                        "WHERE user_id = :user_id AND provider_id = :provider_id FOR UPDATE"
                    ),
                    {"user_id": user_id, "provider_id": provider_id},
                )
                if config.scalar_one_or_none() is None:
                    await session.rollback()
                    return False
                lease = await session.execute(
                    text(
                        "SELECT execution_count FROM provider_execution_leases "
                        "WHERE provider_id = :provider_id FOR UPDATE"
                    ),
                    {"provider_id": provider_id},
                )
                if (lease.scalar_one_or_none() or 0) > 0:
                    await session.rollback()
                    raise ProviderExecutionActiveError(
                        "Provider configuration is in use by an active chat request"
                    )
                await session.execute(
                    text(
                        "DELETE FROM provider_default_models "
                        "WHERE user_id = :user_id AND provider_id = :provider_id"
                    ),
                    {"user_id": user_id, "provider_id": provider_id},
                )
                await session.execute(
                    text(
                        "DELETE FROM provider_execution_leases "
                        "WHERE provider_id = :provider_id"
                    ),
                    {"provider_id": provider_id},
                )
                result = await session.execute(
                    text(
                        "DELETE FROM provider_configs "
                        "WHERE user_id = :user_id AND provider_id = :provider_id"
                    ),
                    {"user_id": user_id, "provider_id": provider_id},
                )
                await session.commit()
                return bool(result.rowcount)
            except Exception:
                await session.rollback()
                raise

    async def acquire_execution(self, user_id: str, provider_id: str) -> bool:
        """Acquire a durable lease after locking the owned configuration row."""
        async with get_session_factory()() as session:
            try:
                config = await session.execute(
                    text(
                        "SELECT provider_id FROM provider_configs "
                        "WHERE user_id = :user_id AND provider_id = :provider_id FOR UPDATE"
                    ),
                    {"user_id": user_id, "provider_id": provider_id},
                )
                if config.scalar_one_or_none() is None:
                    await session.rollback()
                    return False
                await session.execute(
                    text(
                        """
                        INSERT INTO provider_execution_leases
                            (provider_id, execution_count, updated_at)
                        VALUES (:provider_id, 1, :updated_at)
                        ON CONFLICT (provider_id) DO UPDATE SET
                            execution_count = provider_execution_leases.execution_count + 1,
                            updated_at = EXCLUDED.updated_at
                        """
                    ),
                    {"provider_id": provider_id, "updated_at": _now()},
                )
                await session.commit()
                return True
            except Exception:
                await session.rollback()
                raise

    async def release_execution(self, provider_id: str) -> None:
        """Release one durable execution lease without underflowing the count."""
        async with get_session_factory()() as session:
            try:
                await session.execute(
                    text(
                        """
                        UPDATE provider_execution_leases
                        SET execution_count = GREATEST(execution_count - 1, 0),
                            updated_at = :updated_at
                        WHERE provider_id = :provider_id
                        """
                    ),
                    {"provider_id": provider_id, "updated_at": _now()},
                )
                await session.execute(
                    text(
                        "DELETE FROM provider_execution_leases "
                        "WHERE provider_id = :provider_id AND execution_count = 0"
                    ),
                    {"provider_id": provider_id},
                )
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def set_enabled(
        self, user_id: str, provider_id: str, is_enabled: bool
    ) -> dict[str, Any] | None:
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    "UPDATE provider_configs SET is_enabled = :is_enabled, updated_at = :updated_at "
                    "WHERE user_id = :user_id AND provider_id = :provider_id"
                ),
                {
                    "user_id": user_id,
                    "provider_id": provider_id,
                    "is_enabled": is_enabled,
                    "updated_at": _now(),
                },
            )
            if not result.rowcount:
                return None
            if not is_enabled:
                await session.execute(
                    text(
                        "DELETE FROM provider_default_models "
                        "WHERE user_id = :user_id AND provider_id = :provider_id"
                    ),
                    {"user_id": user_id, "provider_id": provider_id},
                )
            await session.commit()
        return await self.get(user_id, provider_id)

    async def get_default(self, user_id: str) -> dict[str, Any] | None:
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    """
                    SELECT d.provider_id, d.model_id, d.updated_at, p.provider, p.name
                    FROM provider_default_models d
                    JOIN provider_configs p
                      ON p.provider_id = d.provider_id AND p.user_id = d.user_id
                    WHERE d.user_id = :user_id AND p.is_enabled = TRUE
                    """
                ),
                {"user_id": user_id},
            )
            row = result.mappings().one_or_none()
            return dict(row) if row else None

    async def set_default(
        self, user_id: str, provider_id: str, model_id: str
    ) -> dict[str, Any] | None:
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    "SELECT provider_id FROM provider_configs "
                    "WHERE user_id = :user_id AND provider_id = :provider_id AND is_enabled = TRUE"
                ),
                {"user_id": user_id, "provider_id": provider_id},
            )
            if result.scalar_one_or_none() is None:
                return None
            await session.execute(
                text(
                    """
                    INSERT INTO provider_default_models (user_id, provider_id, model_id, updated_at)
                    VALUES (:user_id, :provider_id, :model_id, :updated_at)
                    ON CONFLICT (user_id) DO UPDATE SET
                        provider_id = EXCLUDED.provider_id, model_id = EXCLUDED.model_id,
                        updated_at = EXCLUDED.updated_at
                    """
                ),
                {
                    "user_id": user_id,
                    "provider_id": provider_id,
                    "model_id": model_id,
                    "updated_at": _now(),
                },
            )
            await session.commit()
        return await self.get_default(user_id)
