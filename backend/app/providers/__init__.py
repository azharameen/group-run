"""User-scoped LLM provider configuration and adapter boundary."""

from .runtime import get_configured_chat_model

__all__ = ["get_configured_chat_model"]
