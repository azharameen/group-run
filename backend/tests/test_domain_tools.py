import json
from pathlib import Path
from unittest.mock import patch

from app.agent.domain_tools import save_workspace_item, record_approval_decision


def test_save_workspace_item(patch_config):
    """Test save_workspace_item correctly saves generic items and returns expected dict."""
    item_type = "research-notes"
    item_id = "test-note-1"
    title = "Test Note"
    content = "This is a test note."
    source_refs = ["doc1.pdf", "doc2.md"]

    item = save_workspace_item(
        item_type=item_type, item_id=item_id, title=title, content=content, source_refs=source_refs
    )

    # Assert correct returned dict
    assert item["item_type"] == item_type
    assert item["item_id"] == item_id
    assert item["title"] == title
    assert item["content"] == content
    assert item["source_refs"] == source_refs
    assert "created_at" in item
    assert item["provenance"] == f"{item_type}:{item_id}"

    # Assert file is written correctly
    item_path = Path(patch_config) / item_type / f"{item_id}.json"
    assert item_path.exists()

    with open(item_path, "r", encoding="utf-8") as f:
        saved_data = json.load(f)

    assert saved_data == item


def test_save_workspace_item_no_refs(patch_config):
    """Test save_workspace_item works when source_refs is None."""
    item_type = "research-notes"
    item_id = "test-note-2"
    title = "Test Note 2"
    content = "This is another test note."

    item = save_workspace_item(item_type=item_type, item_id=item_id, title=title, content=content, source_refs=None)

    assert item["source_refs"] == []

    item_path = Path(patch_config) / item_type / f"{item_id}.json"
    assert item_path.exists()
    with open(item_path, "r", encoding="utf-8") as f:
        saved_data = json.load(f)
    assert saved_data["source_refs"] == []


@patch("app.agent.domain_tools.save_idea_yaml")
@patch("app.agent.domain_tools.load_idea_yaml")
def test_record_approval_decision_existing_idea(mock_load, mock_save):
    """Test recording a decision when the idea and reviews already exist."""
    mock_load.return_value = {
        "title": "Existing Idea",
        "reviews": {
            "counsel": {
                "status": "approved",
                "comments": "Looks good",
                "timestamp": "2023-10-26T12:00:00Z",
                "provenance": "approval:test-idea-1:counsel",
                "trust": "trusted",
            }
        },
    }

    result = record_approval_decision(
        idea_id="test-idea-1", reviewer_role="Manager", decision="rejected", comments="Needs more work"
    )

    assert result == {"idea_id": "test-idea-1", "reviewer": "Manager", "decision": "rejected"}

    mock_load.assert_called_once_with("test-idea-1", "idea.yaml")
    mock_save.assert_called_once()

    saved_idea_id, saved_filename, saved_data = mock_save.call_args[0]
    assert saved_idea_id == "test-idea-1"
    assert saved_filename == "idea.yaml"

    assert "counsel" in saved_data["reviews"]
    assert "manager" in saved_data["reviews"]
    assert saved_data["reviews"]["manager"]["status"] == "rejected"
    assert saved_data["reviews"]["manager"]["comments"] == "Needs more work"
    assert saved_data["reviews"]["manager"]["trust"] == "trusted"
    assert "timestamp" in saved_data["reviews"]["manager"]
    assert saved_data["reviews"]["manager"]["provenance"] == "approval:test-idea-1:manager"


@patch("app.agent.domain_tools.save_idea_yaml")
@patch("app.agent.domain_tools.load_idea_yaml")
def test_record_approval_decision_new_idea(mock_load, mock_save):
    """Test recording a decision when no idea.yaml exists (returns None)."""
    mock_load.return_value = None

    result = record_approval_decision(idea_id="test-idea-2", reviewer_role="Counsel", decision="approved")

    assert result == {"idea_id": "test-idea-2", "reviewer": "Counsel", "decision": "approved"}

    mock_load.assert_called_once_with("test-idea-2", "idea.yaml")
    mock_save.assert_called_once()

    saved_idea_id, saved_filename, saved_data = mock_save.call_args[0]
    assert saved_idea_id == "test-idea-2"
    assert saved_filename == "idea.yaml"

    assert "counsel" in saved_data["reviews"]
    assert saved_data["reviews"]["counsel"]["status"] == "approved"
    assert saved_data["reviews"]["counsel"]["comments"] == ""
    assert saved_data["reviews"]["counsel"]["trust"] == "trusted"
    assert "timestamp" in saved_data["reviews"]["counsel"]
    assert saved_data["reviews"]["counsel"]["provenance"] == "approval:test-idea-2:counsel"
