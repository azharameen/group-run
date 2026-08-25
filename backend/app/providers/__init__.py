"""App-wide LLM provider configuration and adapter boundary."""

from .runtime import get_configured_chat_model, has_active_provider, refresh_active_provider

__all__ = ["get_configured_chat_model", "has_active_provider", "refresh_active_provider"]
