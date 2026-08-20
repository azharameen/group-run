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


def test_query_prior_art_taxonomy_exact_match(monkeypatch, tmp_path):
    """Test returning matched category code when found in taxonomy file."""
    taxonomy_file = tmp_path / "prior_art_taxonomy.json"
    taxonomy_file.write_text(
        json.dumps(
            {
                "categories": [
                    {"code": "CAT1", "name": "Category 1"},
                    {"code": "TEST_CAT", "name": "Test Category", "keywords": ["test"]},
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.agent.domain_tools.KNOWLEDGE_BASE_DIR", str(tmp_path))

    from app.agent.domain_tools import query_prior_art_taxonomy

    result = query_prior_art_taxonomy("TEST_CAT")

    assert result == {"code": "TEST_CAT", "name": "Test Category", "keywords": ["test"]}


def test_query_prior_art_taxonomy_not_found(monkeypatch, tmp_path):
    """Test returning first category when requested code is not in file."""
    taxonomy_file = tmp_path / "prior_art_taxonomy.json"
    taxonomy_file.write_text(
        json.dumps({"categories": [{"code": "DEFAULT_CAT", "name": "Default"}, {"code": "OTHER", "name": "Other"}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.agent.domain_tools.KNOWLEDGE_BASE_DIR", str(tmp_path))

    from app.agent.domain_tools import query_prior_art_taxonomy

    result = query_prior_art_taxonomy("MISSING_CAT")

    assert result == {"code": "DEFAULT_CAT", "name": "Default"}


def test_query_prior_art_taxonomy_invalid_json(monkeypatch, tmp_path):
    """Test falling back to default taxonomy on invalid JSON."""
    taxonomy_file = tmp_path / "prior_art_taxonomy.json"
    taxonomy_file.write_text("invalid json", encoding="utf-8")
    monkeypatch.setattr("app.agent.domain_tools.KNOWLEDGE_BASE_DIR", str(tmp_path))

    from app.agent.domain_tools import query_prior_art_taxonomy

    result = query_prior_art_taxonomy("ANY_CAT")

    assert result["code"] == "IND_AI"
    assert "Industrial Artificial Intelligence" in result["name"]


def test_query_prior_art_taxonomy_file_missing(monkeypatch, tmp_path):
    """Test falling back to default taxonomy when file does not exist."""
    monkeypatch.setattr("app.agent.domain_tools.KNOWLEDGE_BASE_DIR", str(tmp_path))

    from app.agent.domain_tools import query_prior_art_taxonomy

    result = query_prior_art_taxonomy("ANY_CAT")

    assert result["code"] == "IND_AI"
    assert "Industrial Artificial Intelligence" in result["name"]


def test_query_prior_art_taxonomy_read_error(monkeypatch, tmp_path):
    """Test falling back to default taxonomy on file read error."""
    taxonomy_file = tmp_path / "prior_art_taxonomy.json"
    taxonomy_file.touch()
    monkeypatch.setattr("app.agent.domain_tools.KNOWLEDGE_BASE_DIR", str(tmp_path))

    from pathlib import Path

    original_read_text = Path.read_text

    def mock_read_text(self, *args, **kwargs):
        if self.name == "prior_art_taxonomy.json":
            raise OSError("Permission denied")
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr("pathlib.Path.read_text", mock_read_text)

    from app.agent.domain_tools import query_prior_art_taxonomy

    result = query_prior_art_taxonomy("ANY_CAT")

    assert result["code"] == "IND_AI"
    assert "Industrial Artificial Intelligence" in result["name"]
