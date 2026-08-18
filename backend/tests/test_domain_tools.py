import json
from pathlib import Path

from app.agent.domain_tools import save_workspace_item

def test_save_workspace_item(patch_config):
    """Test save_workspace_item correctly saves generic items and returns expected dict."""
    item_type = "research-notes"
    item_id = "test-note-1"
    title = "Test Note"
    content = "This is a test note."
    source_refs = ["doc1.pdf", "doc2.md"]

    item = save_workspace_item(
        item_type=item_type,
        item_id=item_id,
        title=title,
        content=content,
        source_refs=source_refs
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

    item = save_workspace_item(
        item_type=item_type,
        item_id=item_id,
        title=title,
        content=content,
        source_refs=None
    )

    assert item["source_refs"] == []

    item_path = Path(patch_config) / item_type / f"{item_id}.json"
    assert item_path.exists()
    with open(item_path, "r", encoding="utf-8") as f:
        saved_data = json.load(f)
    assert saved_data["source_refs"] == []
