"""Validation rules for supported provider configuration payloads."""

from typing import Any
from urllib.parse import urlparse

from .adapters import SUPPORTED_PROVIDERS

DEFAULT_ENDPOINTS = {
    "openai": "https://api.openai.com/v1",
    "google": "https://generativelanguage.googleapis.com",
    "ollama": "http://localhost:11434",
    "anthropic": "https://api.anthropic.com",
}


def _endpoint(provider: str, endpoint: Any) -> str:
    if provider == "ollama" and not endpoint:
        raise ValueError("Ollama endpoint is required")
    value = str(endpoint or DEFAULT_ENDPOINTS[provider]).strip().rstrip("/")
    parsed = urlparse(value)
    allowed_schemes = {"http", "https"} if provider == "ollama" else {"https"}
    if (
        parsed.scheme not in allowed_schemes
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(f"{provider.title()} endpoint must be a valid supported URL")
    return value


def _credentials(
    provider: str, credentials: Any, has_existing_credentials: bool
) -> dict[str, Any] | None:
    if provider == "ollama":
        if credentials not in (None, {}):
            raise ValueError("Ollama does not accept credentials")
        return None
    if credentials is None:
        if not has_existing_credentials:
            raise ValueError(f"{provider.title()} API key is required")
        return None
    if not isinstance(credentials, dict) or set(credentials) != {"api_key"}:
        raise ValueError(f"{provider.title()} credentials must contain only api_key")
    api_key = credentials.get("api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        raise ValueError(f"{provider.title()} API key is required")
    return {"api_key": api_key.strip()}


def validate_provider_payload(
    payload: dict[str, Any], has_existing_credentials: bool = False
) -> dict[str, Any]:
    """Validate provider-specific fields before credentials are encrypted."""
    provider = str(payload.get("provider", "")).lower().strip()
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported provider: {provider or 'missing'}")
    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValueError("Provider name is required")
    if "model" in payload:
        raise ValueError("Model selection is discovered separately")
    enabled = payload.get("is_enabled", False)
    if not isinstance(enabled, bool):
        raise ValueError("Enabled must be a boolean")  # noqa: TRY004
    return {
        "provider": provider,
        "name": name,
        "endpoint": _endpoint(provider, payload.get("endpoint")),
        "credentials": _credentials(provider, payload.get("credentials"), has_existing_credentials),
        "is_enabled": enabled,
    }
