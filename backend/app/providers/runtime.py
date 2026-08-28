"""Request-scoped bridge from persisted provider configs to LangChain models."""

from __future__ import annotations

from typing import Any

from ..agent.test_model import TEST_MODEL_SENTINEL, resolve_chat_model
from .adapters import ProviderDefinition, get_adapter


def get_configured_chat_model(
    definition: ProviderDefinition | None = None,
    model_id: str | None = None,
    configured_model: str = "",
) -> Any:
    """Create exactly the selected model; never resolve a global active provider."""
    if definition is not None:
        if not model_id:
            raise RuntimeError("A discovered model selection is required")
        return get_adapter(definition.provider).build_model(definition, model_id)
    if model_id:
        raise RuntimeError("A provider configuration is required for the selected model")
    if configured_model == TEST_MODEL_SENTINEL:
        return resolve_chat_model(configured_model)
    if configured_model:
        return resolve_chat_model(configured_model)
    raise RuntimeError("No provider model selection is configured.")
