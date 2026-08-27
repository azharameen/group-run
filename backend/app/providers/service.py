"""Provider configuration validation, ownership, discovery, and selection."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy.exc import IntegrityError

from ..config import settings
from .adapters import CatalogResult, ProviderDefinition, get_adapter
from .crypto import CredentialCipher
from .repository import ProviderExecutionActiveError, ProviderRepository
from .validation import validate_provider_payload


class ProviderSelectionError(ValueError):
    """A requested provider/model pair cannot safely execute."""


class ProviderConfigService:
    """Application service for the four server-supported integrations."""

    def __init__(
        self,
        repository: ProviderRepository | None = None,
        cipher: CredentialCipher | None = None,
    ):
        self.repository = repository or ProviderRepository()
        self._cipher = cipher

    _validate = staticmethod(validate_provider_payload)

    def _cipher_for_credentials(self) -> CredentialCipher:
        if self._cipher is None:
            self._cipher = CredentialCipher()
        return self._cipher

    async def list_safe(self, user_id: str) -> list[dict[str, Any]]:
        return await self.repository.list(user_id)

    async def get_safe(self, user_id: str, provider_id: str) -> dict[str, Any] | None:
        return await self.repository.get(user_id, provider_id)

    async def save(
        self, user_id: str, payload: dict[str, Any], provider_id: str | None = None
    ) -> dict[str, Any]:
        existing = (
            await self.repository.get(user_id, provider_id, include_credentials=True)
            if provider_id
            else None
        )
        if provider_id and existing is None:
            raise LookupError("Provider not found")
        values = self._validate(payload, bool(existing and existing.get("encrypted_credentials")))
        if existing and existing["provider"] != values["provider"]:
            raise ValueError("Provider type cannot be changed after creation")
        credentials = values.pop("credentials")
        values["encrypted_credentials"] = (
            self._cipher_for_credentials().encrypt(credentials) if credentials else None
        )
        try:
            record = await self.repository.save(user_id, values, provider_id)
        except IntegrityError as exc:
            raise ValueError("A provider configuration with this name already exists") from exc
        if record is None:
            raise LookupError("Provider not found")
        return record

    async def delete(self, user_id: str, provider_id: str) -> bool:
        try:
            return await self.repository.delete(user_id, provider_id)
        except ProviderExecutionActiveError as exc:
            raise ProviderSelectionError(str(exc)) from exc

    @asynccontextmanager
    async def execution(self, user_id: str, provider_id: str) -> AsyncIterator[None]:
        """Hold a database-backed lease for one exact provider execution."""
        if not await self.repository.acquire_execution(user_id, provider_id):
            raise ProviderSelectionError("Provider configuration is unavailable")
        try:
            yield
        finally:
            await self.repository.release_execution(provider_id)

    async def set_enabled(
        self, user_id: str, provider_id: str, is_enabled: bool
    ) -> dict[str, Any] | None:
        return await self.repository.set_enabled(user_id, provider_id, is_enabled)

    async def _definition(self, user_id: str, provider_id: str) -> tuple[dict[str, Any], ProviderDefinition]:
        record = await self.repository.get(user_id, provider_id, include_credentials=True)
        if not record:
            raise LookupError("Provider not found")
        encrypted = record.get("encrypted_credentials")
        credentials = self._cipher_for_credentials().decrypt(encrypted) if encrypted else {}
        return record, ProviderDefinition(record["provider"], record["endpoint"], credentials)

    async def catalog(self, user_id: str, provider_id: str) -> CatalogResult:
        record, definition = await self._definition(user_id, provider_id)
        if not record["is_enabled"]:
            raise ProviderSelectionError("Provider configuration is disabled")
        return await get_adapter(definition.provider).list_models(definition)

    async def grouped_catalog(self, user_id: str) -> list[dict[str, Any]]:
        groups: list[dict[str, Any]] = []
        for record in await self.repository.list(user_id, enabled_only=True):
            try:
                result = await self.catalog(user_id, record["provider_id"])
                groups.append(
                    {
                        **record,
                        "available": result.available,
                        "message": result.message,
                        "models": [model.__dict__ for model in result.models],
                    }
                )
            except RuntimeError as exc:
                groups.append({**record, "available": False, "message": str(exc), "models": []})
        return groups

    async def test(self, user_id: str, provider_id: str) -> tuple[bool, str]:
        _, definition = await self._definition(user_id, provider_id)
        return await get_adapter(definition.provider).test_connection(definition)

    async def get_default(self, user_id: str) -> dict[str, Any] | None:
        return await self.repository.get_default(user_id)

    async def set_default(
        self, user_id: str, provider_id: str, model_id: str
    ) -> dict[str, Any]:
        result = await self.catalog(user_id, provider_id)
        if not result.available:
            raise ProviderSelectionError(result.message)
        if model_id not in {model.model_id for model in result.models}:
            raise ProviderSelectionError("Selected model is not available from this provider")
        value = await self.repository.set_default(user_id, provider_id, model_id)
        if value is None:
            raise LookupError("Enabled provider not found")
        return value

    async def resolve_model(
        self, user_id: str, provider_id: str | None, model_id: str | None
    ) -> tuple[str | None, str | None, ProviderDefinition | None]:
        """Resolve the exact (provider, model) pair a chat must use.

        Raises ProviderSelectionError when the selection is invalid, stale, or
        absent — the endpoint layer maps that to a 409.

        When the user has no provider configurations at all and a fallback model
        is configured via DEEPAGENTS_MODEL (CI/local deterministic mode,
        NFR-A10), resolves to ``(None, None, None)`` so the agent runs on the
        environment model instead of failing. A user who does have provider
        configurations but no usable default still gets an explicit error — a
        disabled or stale selection never falls back silently.
        """
        if bool(provider_id) != bool(model_id):
            raise ProviderSelectionError("Provider configuration and model must be selected together")
        if not provider_id or not model_id:
            default = await self.get_default(user_id)
            if not default:
                if settings.deepagents_model and not await self.repository.list(user_id):
                    return None, None, None
                raise ProviderSelectionError("Choose an enabled provider model before starting a chat")
            provider_id, model_id = default["provider_id"], default["model_id"]
        result = await self.catalog(user_id, provider_id)
        if not result.available:
            raise ProviderSelectionError(result.message)
        if model_id not in {model.model_id for model in result.models}:
            raise ProviderSelectionError("Selected model is no longer available from this provider")
        _, definition = await self._definition(user_id, provider_id)
        return provider_id, model_id, definition
