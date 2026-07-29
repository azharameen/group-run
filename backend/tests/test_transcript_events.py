"""Tests for transcript event normalization and persistence."""

from fastapi.testclient import TestClient

from app.api.app import create_app
from app.agent.domain_tools import draft_patent_section
from app.storage.yaml_io import create_idea_folder, load_transcript_events, save_transcript_event
from app.storage.yaml_io import save_idea_yaml, load_idea_yaml


def test_save_transcript_event_normalizes_metadata(patch_config):
    idea_id = "IDEA-TRANSCRIPT-001"
    create_idea_folder(idea_id)

    saved = save_transcript_event(idea_id, {
        "type": "tool_call",
        "agent": "prior-art-researcher",
        "tool": "query_prior_art_taxonomy",
        "params": {"query": "sensor anomaly"},
    })

    assert saved["idea_id"] == idea_id
    assert saved["role"] == "tool"
    assert saved["speaker"] == "prior-art-researcher"
    assert saved["trust"] == "verified-tool-call"
    assert saved["provenance"].startswith(f"transcript:{idea_id}:tool_call:")

    loaded = load_transcript_events(idea_id)
    assert len(loaded) == 1
    assert loaded[0]["tool"] == "query_prior_art_taxonomy"


def test_chat_history_returns_transcript_events(patch_config):
    idea_id = "IDEA-TRANSCRIPT-002"
    create_idea_folder(idea_id)
    save_transcript_event(idea_id, {
        "type": "thinking",
        "speaker": "workflow-orchestrator",
        "content": "Routing request",
    })

    client = TestClient(create_app())
    response = client.get(f"/api/ideas/{idea_id}/chat")
    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript_events"]
    assert payload["transcript_events"][0]["type"] == "thinking"


def test_draft_patent_section_records_provenance(patch_config):
    idea_id = "IDEA-TRANSCRIPT-003"
    create_idea_folder(idea_id)
    save_idea_yaml(idea_id, "idea.yaml", {"idea_id": idea_id, "title": "Test"})

    assert draft_patent_section(idea_id, "ideascope_draft", "Draft content")

    idea = load_idea_yaml(idea_id, "idea.yaml")
    section = idea["ideascope_draft_data"]
    assert section["provenance"] == f"artifact:{idea_id}:ideascope_draft"
    assert section["trust"] == "generated"
