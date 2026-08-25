"""Provider adapter boundary for connection tests and LangChain models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

SUPPORTED_PROVIDERS = ("openai", "google", "gemini", "ollama")


@dataclass(frozen=True)
class ProviderDefinition:
    provider: str
    endpoint: str
    model: str
    credentials: dict[str, Any]


class ProviderAdapter:
    """Small provider-specific boundary; callers never handle provider secrets."""

    provider: str

    async def test_connection(self, config: ProviderDefinition) -> tuple[bool, str]:
        raise NotImplementedError

    def build_model(self, config: ProviderDefinition) -> Any:
        raise NotImplementedError


class OpenAIAdapter(ProviderAdapter):
    provider = "openai"

    async def test_connection(self, config: ProviderDefinition) -> tuple[bool, str]:
        key = config.credentials.get("api_key")
        if not key:
            return False, "OpenAI API key is required"
        url = config.endpoint.rstrip("/") + "/models"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers={"Authorization": f"Bearer {key}"})
            return (response.status_code < 400, "OpenAI connection successful" if response.status_code < 400 else "OpenAI credentials were rejected")
        except httpx.HTTPError:
            return False, "Unable to connect to OpenAI endpoint"

    def build_model(self, config: ProviderDefinition) -> Any:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=config.model,
            api_key=config.credentials.get("api_key"),
            base_url=config.endpoint or None,
        )


class GoogleAdapter(ProviderAdapter):
    provider = "google"

    async def test_connection(self, config: ProviderDefinition) -> tuple[bool, str]:
        key = config.credentials.get("api_key")
        if not key:
            return False, "Google API key is required"
        url = config.endpoint.rstrip("/") + f"/v1beta/models/{config.model}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers={"x-goog-api-key": key})
            return (response.status_code < 400, "Google Gemini connection successful" if response.status_code < 400 else "Google Gemini credentials were rejected")
        except httpx.HTTPError:
            return False, "Unable to connect to Google Gemini endpoint"

    def build_model(self, config: ProviderDefinition) -> Any:
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=config.model,
            google_api_key=config.credentials.get("api_key"),
        )


class OllamaAdapter(ProviderAdapter):
    provider = "ollama"

    async def test_connection(self, config: ProviderDefinition) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(config.endpoint.rstrip("/") + "/api/tags")
            return (response.status_code < 400, "Ollama connection successful" if response.status_code < 400 else "Ollama endpoint rejected the request")
        except httpx.HTTPError:
            return False, "Unable to connect to Ollama endpoint"

    def build_model(self, config: ProviderDefinition) -> Any:
        from langchain_ollama import ChatOllama

        return ChatOllama(model=config.model, base_url=config.endpoint)


ADAPTERS: dict[str, ProviderAdapter] = {
    "openai": OpenAIAdapter(),
    "google": GoogleAdapter(),
    "gemini": GoogleAdapter(),
    "ollama": OllamaAdapter(),
}


def get_adapter(provider: str) -> ProviderAdapter:
    try:
        return ADAPTERS[provider]
    except KeyError as exc:
        raise ValueError(f"Unsupported provider: {provider}") from exc
