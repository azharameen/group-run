"""Focused tests for user-scoped provider configuration behavior."""

from __future__ import annotations

import sys
import types
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Any

import pytest
from app.api.routes import providers as provider_routes
from app.auth.models import AuthenticatedPrincipal
from app.providers.adapters import (
    CatalogResult,
    DiscoveredModel,
    ProviderAdapter,
    ProviderDefinition,
    get_adapter,
)
from app.providers.crypto import CredentialCipher
from app.providers.repository import ProviderExecutionActiveError
from app.providers.runtime import get_configured_chat_model
from app.providers.service import ProviderConfigService, ProviderSelectionError
from cryptography.fernet import Fernet
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


class FakeProviderRepository:
    """In-memory repository retaining the same user boundary as PostgreSQL."""

    def __init__(self):
        self.records: dict[tuple[str, str], dict[str, Any]] = {}
        self.default: dict[str, dict[str, Any]] = {}
        self.executions: dict[str, int] = {}

    async def list(self, user_id: str, enabled_only: bool = False):
        return [
            self._safe(record)
            for (owner, _), record in self.records.items()
            if owner == user_id and (not enabled_only or record["is_enabled"])
        ]

    async def get(self, user_id: str, provider_id: str, include_credentials: bool = False):
        record = self.records.get((user_id, provider_id))
        if record is None:
            return None
        return dict(record) if include_credentials else self._safe(record)

    async def save(self, user_id: str, values: dict[str, Any], provider_id: str | None = None):
        provider_id = provider_id or f"config-{len(self.records) + 1}"
        existing = self.records.get((user_id, provider_id), {})
        record = {
            **existing,
            **values,
            "provider_id": provider_id,
            "user_id": user_id,
            "created_at": existing.get("created_at", "created"),
            "updated_at": "updated",
        }
        if values.get("encrypted_credentials") is None and existing.get("encrypted_credentials"):
            record["encrypted_credentials"] = existing["encrypted_credentials"]
        self.records[(user_id, provider_id)] = record
        return self._safe(record)

    async def delete(self, user_id: str, provider_id: str):
        if self.executions.get(provider_id, 0):
            raise ProviderExecutionActiveError(
                "Provider configuration is in use by an active chat request"
            )
        self.default.pop(user_id, None)
        return self.records.pop((user_id, provider_id), None) is not None

    async def acquire_execution(self, user_id: str, provider_id: str):
        if (user_id, provider_id) not in self.records:
            return False
        self.executions[provider_id] = self.executions.get(provider_id, 0) + 1
        return True

    async def release_execution(self, provider_id: str):
        remaining = self.executions.get(provider_id, 0) - 1
        if remaining > 0:
            self.executions[provider_id] = remaining
        else:
            self.executions.pop(provider_id, None)

    async def set_enabled(self, user_id: str, provider_id: str, is_enabled: bool):
        record = self.records.get((user_id, provider_id))
        if record is None:
            return None
        record["is_enabled"] = is_enabled
        if not is_enabled:
            self.default.pop(user_id, None)
        return self._safe(record)

    async def get_default(self, user_id: str):
        return self.default.get(user_id)

    async def set_default(self, user_id: str, provider_id: str, model_id: str):
        record = self.records.get((user_id, provider_id))
        if record is None or not record["is_enabled"]:
            return None
        value = {
            "provider_id": provider_id,
            "model_id": model_id,
            "provider": record["provider"],
            "name": record["name"],
            "updated_at": "updated",
        }
        self.default[user_id] = value
        return value

    @staticmethod
    def _safe(record: dict[str, Any]) -> dict[str, Any]:
        return {
            key: record[key]
            for key in ("provider_id", "provider", "name", "endpoint", "is_enabled", "created_at", "updated_at")
        } | {"has_credentials": bool(record.get("encrypted_credentials"))}


class DummyAdapter(ProviderAdapter):
    provider = "openai"

    async def list_models(self, config):
        return CatalogResult(True, "available", (DiscoveredModel("live-model", "Live model"),))

    def build_model(self, config, model_id):
        return {"provider": config.provider, "model": model_id, "key": config.credentials["api_key"]}


@pytest.fixture
def repository() -> FakeProviderRepository:
    return FakeProviderRepository()


@pytest.fixture
def service(repository: FakeProviderRepository) -> ProviderConfigService:
    key = Fernet.generate_key().decode()
    return ProviderConfigService(repository, CredentialCipher(key))


class TestProviderValidation:
    def test_invalid_provider_is_rejected(self):
        with pytest.raises(ValueError, match="Unsupported provider"):
            ProviderConfigService._validate({"provider": "unknown", "name": "x"})

    def test_cloud_key_and_model_payload_are_rejected(self):
        with pytest.raises(ValueError, match="API key is required"):
            ProviderConfigService._validate({"provider": "openai", "name": "x"})
        with pytest.raises(ValueError, match="discovered separately"):
            ProviderConfigService._validate(
                {"provider": "openai", "name": "x", "model": "not-accepted"}
            )

    def test_ollama_requires_endpoint_and_rejects_credentials(self):
        with pytest.raises(ValueError, match="endpoint"):
            ProviderConfigService._validate({"provider": "ollama", "name": "local"})
        with pytest.raises(ValueError, match="does not accept credentials"):
            ProviderConfigService._validate(
                {
                    "provider": "ollama",
                    "name": "local",
                    "endpoint": "http://localhost:11434",
                    "credentials": {"api_key": "not-allowed"},
                }
            )

    def test_endpoint_and_provider_type_changes_are_rejected(self):
        with pytest.raises(ValueError, match="supported URL"):
            ProviderConfigService._validate(
                {
                    "provider": "anthropic",
                    "name": "x",
                    "endpoint": "http://api.anthropic.com",
                    "credentials": {"api_key": "key"},
                }
            )


class TestProviderOwnership:
    @pytest.mark.asyncio
    async def test_credentials_are_encrypted_and_records_are_user_scoped(self, service, repository):
        saved = await service.save(
            "user-a",
            {
                "provider": "openai",
                "name": "Personal",
                "credentials": {"api_key": "secret-value"},
                "is_enabled": False,
            },
        )
        stored = repository.records[("user-a", saved["provider_id"])]
        assert "secret-value" not in stored["encrypted_credentials"]
        assert await service.get_safe("user-b", saved["provider_id"]) is None
        assert await service.list_safe("user-b") == []
        assert "encrypted_credentials" not in saved
        assert saved["has_credentials"] is True

    @pytest.mark.asyncio
    async def test_delete_is_rejected_while_selected_configuration_is_running(self, service):
        saved = await service.save(
            "user-a",
            {
                "provider": "ollama",
                "name": "Local",
                "endpoint": "http://localhost:11434",
                "is_enabled": True,
            },
        )
        async with service.execution("user-a", saved["provider_id"]):
            with pytest.raises(ProviderSelectionError, match="active chat"):
                await service.delete("user-a", saved["provider_id"])

    @pytest.mark.asyncio
    async def test_overlapping_requests_keep_the_configuration_locked(self, service):
        saved = await service.save(
            "user-a",
            {
                "provider": "ollama",
                "name": "Local",
                "endpoint": "http://localhost:11434",
                "is_enabled": True,
            },
        )
        async with service.execution("user-a", saved["provider_id"]):
            async with service.execution("user-a", saved["provider_id"]):
                with pytest.raises(ProviderSelectionError, match="active chat"):
                    await service.delete("user-a", saved["provider_id"])
            with pytest.raises(ProviderSelectionError, match="active chat"):
                await service.delete("user-a", saved["provider_id"])


class TestProviderDiscoveryAndRuntime:
    @pytest.mark.asyncio
    async def test_default_and_runtime_use_the_exact_live_model(self, service, monkeypatch):
        from app.providers import adapters

        monkeypatch.setitem(adapters.ADAPTERS, "openai", DummyAdapter())
        saved = await service.save(
            "user-a",
            {
                "provider": "openai",
                "name": "Personal",
                "credentials": {"api_key": "secret-value"},
                "is_enabled": True,
            },
        )
        catalog = await service.grouped_catalog("user-a")
        assert catalog[0]["models"] == [{"model_id": "live-model", "display_name": "Live model"}]
        default = await service.set_default("user-a", saved["provider_id"], "live-model")
        provider_id, model_id, definition = await service.resolve_model("user-a", None, None)
        assert (provider_id, model_id) == (default["provider_id"], default["model_id"])
        assert get_configured_chat_model(definition, model_id)["model"] == "live-model"

    @pytest.mark.asyncio
    async def test_disabled_or_stale_selection_never_falls_back(self, service, monkeypatch):
        from app.providers import adapters

        monkeypatch.setitem(adapters.ADAPTERS, "openai", DummyAdapter())
        saved = await service.save(
            "user-a",
            {
                "provider": "openai",
                "name": "Personal",
                "credentials": {"api_key": "secret-value"},
                "is_enabled": True,
            },
        )
        with pytest.raises(ProviderSelectionError, match="no longer available"):
            await service.resolve_model("user-a", saved["provider_id"], "missing-model")
        await service.set_enabled("user-a", saved["provider_id"], False)
        with pytest.raises(ProviderSelectionError, match="Choose an enabled"):
            await service.resolve_model("user-a", None, None)
        with pytest.raises(RuntimeError, match="provider configuration"):
            get_configured_chat_model(None, "live-model", "openai:test-model")

    @pytest.mark.asyncio
    async def test_environment_fallback_only_for_users_without_providers(
        self, service, monkeypatch
    ):
        """NFR-A10: a user with no provider configurations at all resolves to
        the DEEPAGENTS_MODEL fallback (CI/local deterministic mode) — but only
        while that fallback is configured."""
        from app.config import settings

        # The autouse isolate_test_env fixture sets DEEPAGENTS_MODEL.
        assert settings.deepagents_model
        provider_id, model_id, definition = await service.resolve_model("user-a", None, None)
        assert (provider_id, model_id, definition) == (None, None, None)

        monkeypatch.setattr(settings, "deepagents_model", "")
        with pytest.raises(ProviderSelectionError, match="Choose an enabled"):
            await service.resolve_model("user-a", None, None)


class TestProviderAdapters:
    @pytest.mark.asyncio
    async def test_discovery_normalizes_each_provider_without_network(self, monkeypatch):
        calls: list[tuple[str, dict[str, str] | None]] = []

        async def fake_get(url: str, headers=None):
            calls.append((url, headers))
            if url.endswith("/api/tags"):
                return 200, {"models": [{"name": "llama-live"}]}
            if "generativelanguage" in url:
                return 200, {
                    "models": [
                        {
                            "name": "models/gemini-live",
                            "supportedGenerationMethods": ["generateContent"],
                        }
                    ]
                }
            return 200, {"data": [{"id": "live-model"}]}

        monkeypatch.setattr(ProviderAdapter, "_get", staticmethod(fake_get))
        definitions = {
            "openai": ProviderDefinition("openai", "https://api.openai.com/v1", {"api_key": "key"}),
            "google": ProviderDefinition(
                "google", "https://generativelanguage.googleapis.com", {"api_key": "key"}
            ),
            "ollama": ProviderDefinition("ollama", "http://localhost:11434", {}),
            "anthropic": ProviderDefinition("anthropic", "https://api.anthropic.com", {"api_key": "key"}),
        }
        for provider, definition in definitions.items():
            result = await get_adapter(provider).list_models(definition)
            assert result.available is True
            assert len(result.models) == 1
        assert calls[0][1] == {"Authorization": "Bearer key"}

    def test_each_provider_constructs_its_own_chat_model(self, monkeypatch):
        class FakeChatModel:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        modules = {
            "langchain_openai": "ChatOpenAI",
            "langchain_google_genai": "ChatGoogleGenerativeAI",
            "langchain_ollama": "ChatOllama",
            "langchain_anthropic": "ChatAnthropic",
        }
        for module_name, class_name in modules.items():
            module = types.ModuleType(module_name)
            setattr(module, class_name, FakeChatModel)
            monkeypatch.setitem(sys.modules, module_name, module)
        definitions = {
            "openai": ProviderDefinition("openai", "https://api.openai.com/v1", {"api_key": "key"}),
            "google": ProviderDefinition(
                "google", "https://generativelanguage.googleapis.com", {"api_key": "key"}
            ),
            "ollama": ProviderDefinition("ollama", "http://localhost:11434", {}),
            "anthropic": ProviderDefinition("anthropic", "https://api.anthropic.com", {"api_key": "key"}),
        }
        models = {}
        for provider, definition in definitions.items():
            model = get_adapter(provider).build_model(definition, "live-model")
            models[provider] = model
            assert isinstance(model, FakeChatModel)
            assert model.kwargs["model"] == "live-model"
        assert models["google"].kwargs["client_options"] == {
            "api_endpoint": definitions["google"].endpoint
        }

    @pytest.mark.asyncio
    async def test_discovery_failures_are_explicit(self, monkeypatch):
        async def unavailable(url: str, headers=None):
            return None

        monkeypatch.setattr(ProviderAdapter, "_get", staticmethod(unavailable))
        result = await get_adapter("ollama").list_models(
            ProviderDefinition("ollama", "http://localhost:11434", {})
        )
        assert result.available is False
        assert result.models == ()

    @pytest.mark.asyncio
    async def test_non_chat_models_are_never_published_or_accepted(self, monkeypatch):
        async def fake_get(url: str, headers=None):
            return 200, {
                "data": [
                    {"id": "gpt-4.1"},
                    {"id": "text-embedding-3-large"},
                    {"id": "dall-e-3"},
                    {"id": "whisper-1"},
                    {"id": "tts-1"},
                ]
            }

        monkeypatch.setattr(ProviderAdapter, "_get", staticmethod(fake_get))
        definition = ProviderDefinition(
            "openai", "https://api.openai.com/v1", {"api_key": "key"}
        )
        result = await get_adapter("openai").list_models(definition)
        assert [model.model_id for model in result.models] == ["gpt-4.1"]
        with pytest.raises(ValueError, match="chat-capable"):
            get_adapter("openai").build_model(definition, "text-embedding-3-large")


def test_migration_resolves_legacy_name_collisions_before_unique_constraint(monkeypatch):
    """A legacy name can collide with both a duplicate and a prior suffix."""
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "003_user_provider_configurations.py"
    )
    spec = spec_from_file_location("migration_003_provider_configs", migration_path)
    assert spec and spec.loader
    migration = module_from_spec(spec)
    fake_alembic = types.ModuleType("alembic")
    fake_alembic.op = types.SimpleNamespace(get_bind=lambda: None)
    monkeypatch.setitem(sys.modules, "alembic", fake_alembic)
    spec.loader.exec_module(migration)

    class Result:
        def mappings(self):
            return iter(
                [
                    {"provider_id": "a", "name": "Work"},
                    {"provider_id": "b", "name": "Work"},
                    {"provider_id": "c", "name": "Work (b)"},
                ]
            )

    class Connection:
        def __init__(self):
            self.updates: list[dict[str, str]] = []

        def execute(self, _statement, parameters=None):
            if parameters:
                self.updates.append(parameters)
                return None
            return Result()

    connection = Connection()
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)
    migration._deduplicate_legacy_names()

    assert connection.updates == [
        {"name": "Work (b)", "provider_id": "b"},
        {"name": "Work (b) (c)", "provider_id": "c"},
    ]


class TestProviderRoutes:
    @pytest.fixture
    def client(self, service, monkeypatch):
        app = FastAPI()

        @app.middleware("http")
        async def set_principal(request: Request, call_next):
            request.state.principal = AuthenticatedPrincipal.from_claims(
                {"sub": request.headers.get("x-user", "user-a")}
            )
            return await call_next(request)

        monkeypatch.setattr(provider_routes, "service", service)
        app.include_router(provider_routes.router)
        return TestClient(app)

    def test_routes_scope_read_update_test_and_delete_to_the_authenticated_user(self, client):
        owner_headers = {"x-user": "user-a"}
        create = client.post(
            "/api/providers",
            headers=owner_headers,
            json={
                "provider": "ollama",
                "name": "Local",
                "endpoint": "http://localhost:11434",
                "is_enabled": False,
            },
        )
        assert create.status_code == 201
        provider_id = create.json()["provider_id"]
        assert "encrypted_credentials" not in create.json()
        assert client.get("/api/providers", headers={"x-user": "user-b"}).json()["providers"] == []
        assert client.get(f"/api/providers/{provider_id}", headers={"x-user": "user-b"}).status_code == 404
        assert client.patch(
            f"/api/providers/{provider_id}/enabled",
            headers={"x-user": "user-b"},
            json={"is_enabled": True},
        ).status_code == 404
        assert client.post(
            f"/api/providers/{provider_id}/test", headers={"x-user": "user-b"}
        ).status_code == 404
        assert client.delete(
            f"/api/providers/{provider_id}", headers={"x-user": "user-b"}
        ).status_code == 404

    def test_routes_reject_unrecognized_provider_fields(self, client):
        response = client.post(
            "/api/providers",
            json={
                "provider": "ollama",
                "name": "Local",
                "endpoint": "http://localhost:11434",
                "is_enabled": False,
                "model": "not-allowed",
            },
        )
        assert response.status_code == 422
