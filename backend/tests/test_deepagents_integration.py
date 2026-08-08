"""Integration test suite for DeepAgents runtime and HITL approval endpoints."""

import sys
import types
import os

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
from app.agent.runtime import get_deep_agent_runtime
from app.storage.yaml_io import save_idea_yaml as save_idea, load_idea_yaml as load_idea, create_idea_folder


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_deepagents_runtime_factory(monkeypatch):
    """Verify runtime factory returns a configured runtime when a model is set."""
    from app.config import settings

    settings.deepagents_model = settings.deepagents_model or "openai:test-model"
    deepagents_module = types.ModuleType("deepagents")
    backends_module = types.ModuleType("deepagents.backends")
    checkpoint_module = types.ModuleType("langgraph.checkpoint.memory")

    class _CompositeBackend:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _FilesystemBackend:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _StateBackend:
        pass

    class _FilesystemPermission:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _InMemorySaver:
        pass

    def _create_deep_agent(**kwargs):
        return types.SimpleNamespace(invoke=lambda payload: {"payload": payload, "kwargs": kwargs})

    backends_module.CompositeBackend = _CompositeBackend
    backends_module.FilesystemBackend = _FilesystemBackend
    backends_module.StateBackend = _StateBackend
    deepagents_module.FilesystemPermission = _FilesystemPermission
    deepagents_module.create_deep_agent = _create_deep_agent
    checkpoint_module.InMemorySaver = _InMemorySaver

    monkeypatch.setitem(sys.modules, "deepagents", deepagents_module)
    monkeypatch.setitem(sys.modules, "deepagents.backends", backends_module)
    monkeypatch.setitem(sys.modules, "langgraph.checkpoint.memory", checkpoint_module)

    runtime = get_deep_agent_runtime()
    assert hasattr(runtime, "invoke")


@pytest.mark.xfail(reason="HITL approval endpoints removed in DeepAgent migration")
def test_hitl_approval_endpoints(client):
    """Test interrupt listing, approval, and rejection flows."""
    idea_id = "test_idea_hitl_001"
    create_idea_folder(idea_id)
    save_idea(idea_id, "idea.yaml", {
        "idea_id": idea_id,
        "title": "Test HITL Idea",
        "workflow_state": "MANAGER_REVIEW",
        "reviews": {}
    })

    # Test list interrupts endpoint
    res = client.get("/api/workflow/interrupts")
    assert res.status_code == 200
    assert "pending_interrupts" in res.json()

    # Test approve endpoint
    approve_res = client.post(f"/api/workflow/{idea_id}/approve", json={
        "reviewer": "Manager",
        "decision": "APPROVED",
        "comments": "Great technical novelty."
    })
    assert approve_res.status_code == 200
    data = approve_res.json()
    assert data["success"] is True
    assert data["idea_id"] == idea_id

    # Verify decision persisted in storage
    loaded = load_idea(idea_id, "idea.yaml")
    assert loaded["reviews"]["manager"]["status"] == "APPROVED"

    # Test reject endpoint
    reject_res = client.post(f"/api/workflow/{idea_id}/reject", json={
        "reviewer": "IP Counsel",
        "decision": "REJECTED",
        "comments": "Needs claim clarification."
    })
    assert reject_res.status_code == 200
    r_data = reject_res.json()
    assert r_data["success"] is True
    assert r_data["decision"] == "REJECTED"


@pytest.mark.xfail(reason="Delete approval gate endpoint removed in DeepAgent migration")
def test_delete_request_requires_approval_and_deletes_on_confirm(client, patch_config):
    idea_id = "test_idea_delete_001"
    create_idea_folder(idea_id)
    save_idea(idea_id, "idea.yaml", {
        "idea_id": idea_id,
        "title": "Delete Gate Idea",
        "workflow_state": "IDEASCOPE_DRAFT",
        "reviews": {}
    })

    res = client.delete(f"/api/ideas/{idea_id}")
    assert res.status_code == 200
    payload = res.json()
    assert payload["interrupt_pending"] is True
    interrupts = client.get(f"/api/workflow/interrupts?idea_id={idea_id}")
    assert interrupts.status_code == 200
    assert interrupts.json()["pending_interrupts"]

    approve_res = client.post(f"/api/workflow/{idea_id}/approve", json={
        "reviewer": "Manager",
        "decision": "APPROVED",
        "comments": "Approved for deletion.",
    })
    assert approve_res.status_code == 200
    assert approve_res.json()["special_action"]["deleted"] is True

    get_res = client.get(f"/api/ideas/{idea_id}")
    assert get_res.status_code == 404


@pytest.mark.xfail(reason="Archive approval gate endpoint removed in DeepAgent migration")
def test_archive_request_requires_approval_and_preserves_snapshot(client, patch_config):
    idea_id = "test_idea_archive_001"
    create_idea_folder(idea_id)
    save_idea(idea_id, "idea.yaml", {
        "idea_id": idea_id,
        "title": "Archive Gate Idea",
        "workflow_state": "IDEASCOPE_DRAFT",
        "reviews": {}
    })

    res = client.post(f"/api/ideas/{idea_id}/archive")
    assert res.status_code == 200
    payload = res.json()
    assert payload["interrupt_pending"] is True

    approve_res = client.post(f"/api/workflow/{idea_id}/approve", json={
        "reviewer": "Manager",
        "decision": "APPROVED",
        "comments": "Archive approved.",
    })
    assert approve_res.status_code == 200
    assert approve_res.json()["special_action"]["archived"] is True

    archive_path = os.path.join(patch_config, "archive", "ideas", idea_id)
    assert os.path.exists(archive_path)


@pytest.mark.xfail(reason="Workflow analytics endpoint removed in DeepAgent migration")
def test_review_analytics_reports_roles_and_pending_interrupts(client, patch_config):
    idea_id = "test_idea_analytics_001"
    create_idea_folder(idea_id)
    save_idea(idea_id, "idea.yaml", {
        "idea_id": idea_id,
        "title": "Analytics Idea",
        "workflow_state": "IDEASCOPE_DRAFT",
        "reviews": {
            "manager": {"status": "APPROVED", "comments": "ok"},
        }
    })

    client.post(f"/api/ideas/{idea_id}/archive")

    res = client.get("/api/workflow/analytics")
    assert res.status_code == 200
    payload = res.json()
    assert payload["reviewer_counts"]["manager"] >= 1
    assert payload["pending_interrupts"]["archive"] >= 1


@pytest.mark.xfail(reason="Agent tasks endpoint removed in DeepAgent migration")
def test_agent_tasks_use_runtime_roles(client):
    """Agent task bootstrap should not use fake human persona labels."""
    response = client.get("/api/agent-tasks")
    assert response.status_code == 200
    payload = response.json()
    agents = {task["agent"] for task in payload["tasks"]}
    assert "Alex - Lead Engineer" not in agents
    assert "David - Data Analyst" not in agents
    assert "Emma - IP Manager" not in agents
