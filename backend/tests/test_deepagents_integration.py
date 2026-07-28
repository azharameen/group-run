"""Integration test suite for DeepAgents runtime and HITL approval endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
from app.agent.runtime import get_deep_agent_runtime
from app.storage.yaml_io import save_idea_yaml as save_idea, load_idea_yaml as load_idea, create_idea_folder


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_deepagents_runtime_factory():
    """Verify runtime factory returns configured runtime or None based on settings."""
    runtime = get_deep_agent_runtime()
    # By default feature flag deepagents_enabled is false or model empty
    assert runtime is None or hasattr(runtime, "invoke")


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
