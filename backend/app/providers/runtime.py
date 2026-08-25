"""Runtime bridge from persisted active provider to LangChain models."""

from __future__ import annotations

from typing import Any

from ..agent.test_model import TEST_MODEL_SENTINEL, resolve_chat_model
from ..config import settings
from .adapters import ProviderDefinition, get_adapter
from .encryption import CredentialEncryption

_active_provider: dict[str, Any] | None = None


def refresh_active_provider(record: dict[str, Any] | None) -> None:
    """Update the in-process active provider snapshot (never logs credentials)."""
    global _active_provider
    _active_provider = record


def has_active_provider() -> bool:
    return _active_provider is not None


def get_configured_chat_model(configured_model: str | None = None) -> Any:
    """Return the deterministic CI model or the persisted active provider model."""
    model = configured_model or settings.deepagents_model
    if model == TEST_MODEL_SENTINEL:
        return resolve_chat_model(model)
    if _active_provider:
        encrypted = _active_provider.get("credentials_encrypted")
        credentials = (
            CredentialEncryption(settings.provider_config_encryption_key).decrypt(encrypted)
            if encrypted
            else {}
        )
        definition = ProviderDefinition(
            provider=_active_provider["provider"],
            endpoint=_active_provider.get("endpoint", ""),
            model=_active_provider["model"],
            credentials=credentials,
        )
        return get_adapter(definition.provider).build_model(definition)
    if model:
        return resolve_chat_model(model)
    raise RuntimeError("No active provider configured.")
