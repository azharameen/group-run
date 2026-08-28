"""Provider-specific model discovery, connection checks, and model construction."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

SUPPORTED_PROVIDERS = ("openai", "google", "ollama", "anthropic")

# Catalogs may list generation APIs that cannot serve a chat turn. Keep this
# intentionally conservative: capability metadata wins where a provider offers
# it, and known non-chat identifiers are never exposed as selectable models.
_NON_CHAT_MODEL_MARKERS = (
    "embedding",
    "embed-",
    "-embed",
    "nomic",
    "mxbai",
    "minilm",
    "snowflake-arctic",
    "rerank",
    "whisper",
    "tts",
    "audio",
    "dall-e",
    "gpt-image",
    "image-generation",
    "moderation",
)


@dataclass(frozen=True)
class ProviderDefinition:
    provider: str
    endpoint: str
    credentials: dict[str, Any]


@dataclass(frozen=True)
class DiscoveredModel:
    model_id: str
    display_name: str


@dataclass(frozen=True)
class CatalogResult:
    available: bool
    message: str
    models: tuple[DiscoveredModel, ...] = ()


class ProviderAdapter:
    """Provider boundary that receives credentials only inside the backend."""

    provider: str

    async def list_models(self, config: ProviderDefinition) -> CatalogResult:
        raise NotImplementedError

    async def test_connection(self, config: ProviderDefinition) -> tuple[bool, str]:
        result = await self.list_models(config)
        return result.available, result.message

    def build_model(self, config: ProviderDefinition, model_id: str) -> Any:
        raise NotImplementedError

    def accepts_chat_model(self, model_id: str) -> bool:
        """Reject known non-chat catalog entries before model construction."""
        normalized = model_id.lower()
        return bool(normalized.strip()) and not any(
            marker in normalized for marker in _NON_CHAT_MODEL_MARKERS
        )

    def _models(
        self, items: Any, name_key: str = "id"
    ) -> tuple[DiscoveredModel, ...]:
        if not isinstance(items, list):
            return ()
        values: list[DiscoveredModel] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            model_id = item.get(name_key) or item.get("name")
            if not isinstance(model_id, str) or not self.accepts_chat_model(model_id):
                continue
            display_name = item.get("display_name") or item.get("displayName") or model_id
            values.append(DiscoveredModel(model_id=model_id, display_name=str(display_name)))
        return tuple(values)

    @staticmethod
    async def _get(
        url: str, headers: dict[str, str] | None = None
    ) -> tuple[int, Any] | None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
            return response.status_code, response.json() if response.content else {}
        except (httpx.HTTPError, ValueError):
            return None


class OpenAIAdapter(ProviderAdapter):
    provider = "openai"

    async def list_models(self, config: ProviderDefinition) -> CatalogResult:
        key = config.credentials.get("api_key")
        if not key:
            return CatalogResult(False, "OpenAI API key is required")
        response = await self._get(
            f"{config.endpoint.rstrip('/')}/models", {"Authorization": f"Bearer {key}"}
        )
        if response is None:
            return CatalogResult(False, "Unable to connect to OpenAI endpoint")
        status, body = response
        if status in (401, 403):
            return CatalogResult(False, "OpenAI credentials were rejected")
        if status >= 400:
            return CatalogResult(False, "OpenAI model discovery failed")
        return CatalogResult(True, "OpenAI connection successful", self._models(body.get("data")))

    def build_model(self, config: ProviderDefinition, model_id: str) -> Any:
        if not self.accepts_chat_model(model_id):
            raise ValueError("Selected model is not chat-capable")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=model_id, api_key=config.credentials["api_key"], base_url=config.endpoint)


class GoogleAdapter(ProviderAdapter):
    provider = "google"

    async def list_models(self, config: ProviderDefinition) -> CatalogResult:
        key = config.credentials.get("api_key")
        if not key:
            return CatalogResult(False, "Google Gemini API key is required")
        response = await self._get(
            f"{config.endpoint.rstrip('/')}/v1beta/models", {"x-goog-api-key": key}
        )
        if response is None:
            return CatalogResult(False, "Unable to connect to Google Gemini endpoint")
        status, body = response
        if status in (401, 403):
            return CatalogResult(False, "Google Gemini credentials were rejected")
        if status >= 400:
            return CatalogResult(False, "Google Gemini model discovery failed")
        chat_models = [
            item for item in body.get("models", [])
            if (
                "generateContent" in item.get("supportedGenerationMethods", [])
                and self.accepts_chat_model(str(item.get("name", "")))
            )
        ]
        return CatalogResult(True, "Google Gemini connection successful", self._models(chat_models, "name"))

    def build_model(self, config: ProviderDefinition, model_id: str) -> Any:
        if not self.accepts_chat_model(model_id):
            raise ValueError("Selected model is not chat-capable")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model_id,
            google_api_key=config.credentials["api_key"],
            client_options={"api_endpoint": config.endpoint},
        )


class OllamaAdapter(ProviderAdapter):
    provider = "ollama"

    async def list_models(self, config: ProviderDefinition) -> CatalogResult:
        response = await self._get(f"{config.endpoint.rstrip('/')}/api/tags")
        if response is None:
            return CatalogResult(False, "Unable to connect to Ollama endpoint")
        status, body = response
        if status >= 400:
            return CatalogResult(False, "Ollama endpoint rejected the request")
        return CatalogResult(True, "Ollama connection successful", self._models(body.get("models"), "name"))

    def build_model(self, config: ProviderDefinition, model_id: str) -> Any:
        if not self.accepts_chat_model(model_id):
            raise ValueError("Selected model is not chat-capable")
        from langchain_ollama import ChatOllama

        return ChatOllama(model=model_id, base_url=config.endpoint)


class AnthropicAdapter(ProviderAdapter):
    provider = "anthropic"

    async def list_models(self, config: ProviderDefinition) -> CatalogResult:
        key = config.credentials.get("api_key")
        if not key:
            return CatalogResult(False, "Anthropic API key is required")
        response = await self._get(
            f"{config.endpoint.rstrip('/')}/v1/models",
            {"x-api-key": key, "anthropic-version": "2023-06-01"},
        )
        if response is None:
            return CatalogResult(False, "Unable to connect to Anthropic endpoint")
        status, body = response
        if status in (401, 403):
            return CatalogResult(False, "Anthropic credentials were rejected")
        if status >= 400:
            return CatalogResult(False, "Anthropic model discovery failed")
        return CatalogResult(True, "Anthropic connection successful", self._models(body.get("data")))

    def build_model(self, config: ProviderDefinition, model_id: str) -> Any:
        if not self.accepts_chat_model(model_id):
            raise ValueError("Selected model is not chat-capable")
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=model_id, api_key=config.credentials["api_key"], base_url=config.endpoint)


ADAPTERS: dict[str, ProviderAdapter] = {
    "openai": OpenAIAdapter(),
    "google": GoogleAdapter(),
    "ollama": OllamaAdapter(),
    "anthropic": AnthropicAdapter(),
}


def get_adapter(provider: str) -> ProviderAdapter:
    try:
        return ADAPTERS[provider]
    except KeyError as exc:
        raise ValueError(f"Unsupported provider: {provider}") from exc
