"""Provider configuration service: validation, encryption and safe projections."""

from __future__ import annotations

from typing import Any

from ..config import settings
from .adapters import SUPPORTED_PROVIDERS, ProviderDefinition, get_adapter
from .encryption import CredentialEncryption
from .repository import ProviderRepository
from .runtime import refresh_active_provider

DEFAULT_ENDPOINTS = {
    "openai": "https://api.openai.com/v1",
    "google": "https://generativelanguage.googleapis.com",
    "gemini": "https://generativelanguage.googleapis.com",
    "ollama": "http://localhost:11434",
}


class ProviderConfigService:
    def __init__(self, repository: ProviderRepository | None = None, encryption: CredentialEncryption | None = None):
        self.repository = repository or ProviderRepository()
        # Reading metadata must remain available when the deployment has not
        # configured an encryption key yet; writes and stored-credential tests
        # fail explicitly through _encryptor().
        self.encryption = encryption

    def _encryptor(self) -> CredentialEncryption:
        if self.encryption is None:
            self.encryption = CredentialEncryption(settings.provider_config_encryption_key)
        return self.encryption

    @staticmethod
    def _validate(payload: dict[str, Any]) -> tuple[str, str, str, str, dict[str, Any] | None]:
        provider = str(payload.get("provider", "")).lower()
        if provider not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported provider: {provider or 'missing'}")
        model = str(payload.get("model", "")).strip()
        if not model:
            raise ValueError("Model is required")
        endpoint = str(payload.get("endpoint") or DEFAULT_ENDPOINTS[provider]).rstrip("/")
        name = str(payload.get("name") or f"{provider.title()} provider").strip()
        if not name:
            raise ValueError("Provider name is required")
        credentials = payload.get("credentials")
        if credentials is None and payload.get("api_key"):
            credentials = {"api_key": payload["api_key"]}
        if credentials is not None and not isinstance(credentials, dict):
            raise ValueError("Credentials must be an object")
        if provider in ("openai", "google", "gemini") and credentials is not None and not credentials.get("api_key"):
            raise ValueError(f"{provider.title()} API key is required")
        return provider, name, endpoint, model, credentials

    async def list_safe(self) -> list[dict[str, Any]]:
        return await self.repository.list()

    async def refresh_runtime(self) -> None:
        active = next((record for record in await self.repository.list() if record.get("is_active")), None)
        refresh_active_provider(
            await self.repository.get(active["provider_id"], include_credentials=True)
            if active else None
        )

    async def get_safe(self, provider_id: str) -> dict[str, Any] | None:
        return await self.repository.get(provider_id)

    async def save(self, payload: dict[str, Any], provider_id: str | None = None) -> dict[str, Any]:
        provider, name, endpoint, model, credentials = self._validate(payload)
        encrypted = self._encryptor().encrypt(credentials) if credentials is not None else None
        is_active = payload.get("is_active")
        if is_active is None and provider_id:
            existing = await self.repository.get(provider_id)
            is_active = bool(existing and existing.get("is_active"))
        record = await self.repository.save({
            "provider": provider,
            "name": name,
            "endpoint": endpoint,
            "model": model,
            "credentials_encrypted": encrypted,
            "is_active": bool(is_active),
        }, provider_id)
        if record.get("is_active"):
            refresh_active_provider(await self.repository.get(record["provider_id"], include_credentials=True))
        return record

    async def delete(self, provider_id: str) -> bool:
        deleted = await self.repository.delete(provider_id)
        if deleted:
            active = next((p for p in await self.repository.list() if p.get("is_active")), None)
            refresh_active_provider(active and await self.repository.get(active["provider_id"], include_credentials=True))
        return deleted

    async def activate(self, provider_id: str) -> dict[str, Any] | None:
        record = await self.repository.activate(provider_id)
        if record:
            refresh_active_provider(await self.repository.get(provider_id, include_credentials=True))
        return record

    async def test(self, provider_id: str, credentials: dict[str, Any] | None = None) -> tuple[bool, str]:
        record = await self.repository.get(provider_id, include_credentials=True)
        if not record:
            raise LookupError("Provider not found")
        if credentials is None and not record.get("credentials_encrypted"):
            stored = {}
        elif credentials is not None:
            stored = credentials
        else:
            stored = self._encryptor().decrypt(record["credentials_encrypted"])
        definition = ProviderDefinition(record["provider"], record["endpoint"], record["model"], stored)
        return await get_adapter(record["provider"]).test_connection(definition)
