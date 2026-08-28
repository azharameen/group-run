from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import app.services.interrupt_service as interrupt_module
import pytest
from app.api.app import create_app
from app.api.routes import interrupts as interrupt_routes
from app.auth.models import AuthenticatedPrincipal
from app.providers.adapters import ProviderDefinition
from app.services.interrupt_service import InterruptService
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


@pytest.fixture
async def client(monkeypatch):
    from app.db.session import get_session_factory
    from sqlalchemy import text
    async with get_session_factory()() as session:
        await session.execute(text("DELETE FROM interrupts"))
        await session.commit()
    InterruptService._instance = None

    class FakeProviderService:
        async def resolve_model(self, _user_id, provider_id, model_id):
            return provider_id, model_id, ProviderDefinition(
                "ollama", "http://localhost:11434", {}
            )

        @asynccontextmanager
        async def execution(self, _user_id, _provider_id):
            yield

    monkeypatch.setattr(
        interrupt_routes,
        "get_or_claim_thread",
        AsyncMock(return_value={"provider_id": "provider-1", "model_id": "model-1"}),
    )
    monkeypatch.setattr(interrupt_routes, "provider_service", FakeProviderService())
    client = TestClient(create_app())
    yield client
    InterruptService._instance = None


@pytest.mark.asyncio
async def test_list_pending_empty(client):
    res = client.get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json() == {"interrupts": []}


@pytest.mark.asyncio
async def test_list_pending_with_data(client):
    from app.services.thread_manager import create_thread

    thread = await create_thread(owner_uid="test-user-123")
    interrupt = await InterruptService.instance().create_interrupt(
        thread["thread_id"], "write_file", "Need approval", {"path": "x.txt"}
    )
    res = client.get("/api/interrupts/pending")
    assert res.status_code == 200
    assert res.json()["interrupts"][0]["id"] == interrupt["id"]


def test_create_interrupt_valid(client):
    res = client.post(
        "/api/interrupts/", json={"thread_id": "thread-1", "tool_name": "edit_file", "message": "Approve?"}
    )
    assert res.status_code == 201
    body = res.json()["interrupt"]
    assert body["thread_id"] == "thread-1"
    assert body["tool_name"] == "edit_file"
    assert body["message"] == "Approve?"
    assert body["status"] == "pending"


def test_create_interrupt_persists_reasoning(client):
    res = client.post(
        "/api/interrupts/",
        json={
            "thread_id": "thread-1",
            "tool_name": "edit_file",
            "message": "Approve?",
            "reasoning": "The file change is necessary and low risk.",
        },
    )
    assert res.status_code == 201
    assert res.json()["interrupt"]["reasoning"] == "The file change is necessary and low risk."


def test_create_interrupt_missing_fields(client):
    assert client.post("/api/interrupts/", json={"tool_name": "edit_file", "message": "Approve?"}).status_code == 422


@pytest.mark.asyncio
async def test_approve_interrupt_valid(client):
    interrupt = await InterruptService.instance().create_interrupt("thread-1", "edit_file", "Approve me")
    res = client.patch(
        f"/api/interrupts/{interrupt['id']}/approve",
        json={"decision": "approved", "reason": "ok", "reasoning": "This change is safe."},
    )
    assert res.status_code == 200
    assert res.json()["interrupt"]["status"] == "approved"
    assert res.json()["interrupt"]["reasoning"] == "This change is safe."


def test_approve_interrupt_not_found(client):
    res = client.patch("/api/interrupts/missing/approve", json={"decision": "approved", "reason": "ok"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_approve_interrupt_already_resolved(client):
    interrupt = await InterruptService.instance().create_interrupt("thread-1", "edit_file", "Approve me")
    client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    res = client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "again"})
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_reject_interrupt_valid(client):
    interrupt = await InterruptService.instance().create_interrupt("thread-1", "delete", "Reject me")
    res = client.patch(
        f"/api/interrupts/{interrupt['id']}/reject",
        json={"decision": "rejected", "reason": "no", "reasoning": "This is a dangerous deletion."},
    )
    assert res.status_code == 200
    assert res.json()["interrupt"]["status"] == "rejected"
    assert res.json()["interrupt"]["reasoning"] == "This is a dangerous deletion."


def test_reject_interrupt_not_found(client):
    res = client.patch("/api/interrupts/missing/reject", json={"decision": "rejected", "reason": "no"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_reject_interrupt_already_resolved(client):
    interrupt = await InterruptService.instance().create_interrupt("thread-1", "delete", "Reject me")
    client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    res = client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "again"})
    assert res.status_code == 409


# ── Resume endpoint (Story 8.4) ─────────────────────────────────────────────

async def _resolved_interrupt(client, status="approved"):
    interrupt = await InterruptService.instance().create_interrupt("thread-1", "write_file", "Approve?", {"path": "x.txt"})
    if status == "approved":
        client.patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved", "reason": "ok"})
    else:
        client.patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    return interrupt


def test_resume_unknown_interrupt_404(client):
    res = client.post("/api/interrupts/missing/resume", json={})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_resume_pending_interrupt_409(client):
    interrupt = await InterruptService.instance().create_interrupt("thread-1", "write_file", "Approve?")
    res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 409
    assert "not resolved" in res.json()["detail"]


@pytest.mark.asyncio
async def test_resume_approve_builds_approve_decision(client):
    interrupt = await _resolved_interrupt(client, "approved")
    with patch("app.agent.runner.resume_agent", new=AsyncMock(return_value={"output": "done"})) as mock_resume:
        res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 200
    mock_resume.assert_awaited_once_with(
        interrupt["thread_id"],
        [{"type": "approve"}],
        user_id="test-user-123",
        provider_id="provider-1",
        model_id="model-1",
        provider_definition=ProviderDefinition("ollama", "http://localhost:11434", {}),
    )
    assert res.json()["response"] == "done"


@pytest.mark.asyncio
async def test_resume_reject_builds_reject_decision(client):
    interrupt = await _resolved_interrupt(client, "rejected")
    with patch("app.agent.runner.resume_agent", new=AsyncMock(return_value={"output": "ok"})) as mock_resume:
        res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 200
    mock_resume.assert_awaited_once_with(
        interrupt["thread_id"],
        [{"type": "reject", "message": "no"}],
        user_id="test-user-123",
        provider_id="provider-1",
        model_id="model-1",
        provider_definition=ProviderDefinition("ollama", "http://localhost:11434", {}),
    )


@pytest.mark.asyncio
async def test_resume_no_checkpoint_409(client):
    interrupt = await _resolved_interrupt(client, "approved")
    with patch("app.agent.runner.resume_agent", new=AsyncMock(side_effect=RuntimeError("no checkpoint"))):
        res = client.post(f"/api/interrupts/{interrupt['id']}/resume", json={})
    assert res.status_code == 409
    assert "no resumable state" in res.json()["detail"]


def test_create_interrupt_delivery_failure_returns_500(client):
    with patch.object(interrupt_module._bus, "publish", side_effect=RuntimeError("Bus connection error")):
        res = client.post(
            "/api/interrupts/", json={"thread_id": "thread-1", "tool_name": "edit_file", "message": "Approve?"}
        )
        assert res.status_code == 500
        assert "Failed to deliver interrupt.created event" in res.json()["detail"]


def test_resume_uses_the_owned_thread_provider_without_global_fallback(monkeypatch):
    """HITL resumes exactly the provider/model saved on the owned thread."""
    interrupt = {
        "id": "interrupt-1",
        "thread_id": "thread-1",
        "status": "approved",
        "reason": "ok",
    }
    definition = object()
    resolve_model = AsyncMock(return_value=("provider-1", "model-1", definition))
    resumed = AsyncMock(return_value={"output": "resumed"})

    class FakeInterruptService:
        async def get_interrupt(self, interrupt_id):
            return interrupt if interrupt_id == "interrupt-1" else None

    class FakeProviderService:
        async def resolve_model(self, user_id, provider_id, model_id):
            return await resolve_model(user_id, provider_id, model_id)

        @asynccontextmanager
        async def execution(self, user_id, provider_id):
            yield

    app = FastAPI()

    @app.middleware("http")
    async def set_principal(request: Request, call_next):
        request.state.principal = AuthenticatedPrincipal.from_claims({"sub": "user-a"})
        return await call_next(request)

    app.include_router(interrupt_routes.router)
    monkeypatch.setattr(
        interrupt_routes.InterruptService,
        "instance",
        classmethod(lambda cls: FakeInterruptService()),
    )
    monkeypatch.setattr(
        interrupt_routes,
        "get_or_claim_thread",
        AsyncMock(return_value={"provider_id": "provider-1", "model_id": "model-1"}),
    )
    monkeypatch.setattr(interrupt_routes, "provider_service", FakeProviderService())
    monkeypatch.setattr("app.agent.runner.resume_agent", resumed)

    response = TestClient(app).post("/api/interrupts/interrupt-1/resume", json={})

    assert response.status_code == 200
    resolve_model.assert_awaited_once_with("user-a", "provider-1", "model-1")
    resumed.assert_awaited_once_with(
        "thread-1",
        [{"type": "approve"}],
        user_id="user-a",
        provider_id="provider-1",
        model_id="model-1",
        provider_definition=definition,
    )


def test_resume_rejects_missing_persisted_provider_without_default(monkeypatch):
    """A historical interrupt without an exact selection resolves through the
    user default; without one (and no fallback model) it still 409s."""
    from app.providers.service import ProviderSelectionError

    class FakeInterruptService:
        async def get_interrupt(self, _interrupt_id):
            return {"id": "interrupt-1", "thread_id": "thread-1", "status": "approved"}

    class FakeProviderService:
        resolve_model = AsyncMock(
            side_effect=ProviderSelectionError(
                "Choose an enabled provider model before starting a chat"
            )
        )

    app = FastAPI()

    @app.middleware("http")
    async def set_principal(request: Request, call_next):
        request.state.principal = AuthenticatedPrincipal.from_claims({"sub": "user-a"})
        return await call_next(request)

    app.include_router(interrupt_routes.router)
    monkeypatch.setattr(
        interrupt_routes.InterruptService,
        "instance",
        classmethod(lambda cls: FakeInterruptService()),
    )
    monkeypatch.setattr(
        interrupt_routes, "get_or_claim_thread", AsyncMock(return_value={"title": "legacy"})
    )
    fake_provider_service = FakeProviderService()
    monkeypatch.setattr(interrupt_routes, "provider_service", fake_provider_service)

    response = TestClient(app).post("/api/interrupts/interrupt-1/resume", json={})

    assert response.status_code == 409
    assert "provider" in response.json()["detail"].lower()
    fake_provider_service.resolve_model.assert_awaited_once_with("user-a", None, None)
