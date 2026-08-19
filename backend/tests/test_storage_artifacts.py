import os
from pathlib import Path

from app.storage.artifacts import save_artifact_revision, load_artifact_revisions
from app.storage.idea_workspace import load_idea_yaml, save_idea_yaml


def test_save_first_artifact_revision(patch_config):
    # Setup
    idea_id = "IDEA-0001"
    artifact_name = "test_artifact"
    content = "Hello, world!"
    provenance = "agent"

    # We need to initialize an empty idea.yaml so save_idea_yaml does not fail
    save_idea_yaml(idea_id, "idea.yaml", {})

    record = save_artifact_revision(
        idea_id=idea_id, artifact_name=artifact_name, content=content, provenance=provenance
    )

    # Assert return record
    assert record["artifact_name"] == artifact_name
    assert record["version"] == 1
    assert record["content"] == content
    assert record["provenance"] == provenance
    assert record["trust"] == "generated"
    assert record["evidence_refs"] == []
    # With unified_diff comparing empty string to "Hello, world!", we get a diff
    assert "--- previous" in record["diff"]
    assert "+Hello, world!" in record["diff"]
    assert "timestamp" in record
    assert record["file_name"] == f"{artifact_name}-v01.md"
    assert "path" in record

    # Assert file was written
    artifact_path = Path(record["path"])
    assert artifact_path.exists()
    assert artifact_path.read_text(encoding="utf-8") == content

    # Assert index was updated
    revisions = load_artifact_revisions(idea_id)
    assert len(revisions) == 1
    assert revisions[0]["artifact_name"] == artifact_name
    assert revisions[0]["version"] == 1

    # Assert idea.yaml was updated
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    assert "artifact_revisions" in idea_data
    assert artifact_name in idea_data["artifact_revisions"]
    meta = idea_data["artifact_revisions"][artifact_name]
    assert meta["version"] == 1
    assert meta["provenance"] == provenance
    assert meta["trust"] == "generated"
    assert meta["path"] == str(artifact_path)
    assert "updated_at" in meta


def test_save_second_artifact_revision(patch_config):
    idea_id = "IDEA-0001"
    artifact_name = "test_artifact"

    save_idea_yaml(idea_id, "idea.yaml", {})

    # First revision
    content1 = "Line 1\nLine 2\n"
    save_artifact_revision(idea_id=idea_id, artifact_name=artifact_name, content=content1, provenance="agent")

    # Second revision
    content2 = "Line 1\nLine 2 changed\nLine 3\n"
    record2 = save_artifact_revision(idea_id=idea_id, artifact_name=artifact_name, content=content2, provenance="agent")

    assert record2["version"] == 2
    assert record2["content"] == content2

    # Check diff
    assert "Line 2 changed" in record2["diff"]
    assert "-Line 2" in record2["diff"]
    assert "+Line 3" in record2["diff"]

    # Check that previous file was actually diffed
    artifact_path = Path(record2["path"])
    assert artifact_path.exists()
    assert artifact_path.read_text(encoding="utf-8") == content2

    # Check index
    revisions = load_artifact_revisions(idea_id)
    assert len(revisions) == 2
    assert revisions[1]["version"] == 2
    assert revisions[1]["diff"] == record2["diff"]


def test_save_artifact_revision_handles_missing_previous_file(patch_config):
    idea_id = "IDEA-0001"
    artifact_name = "test_artifact"

    save_idea_yaml(idea_id, "idea.yaml", {})

    # First revision
    record1 = save_artifact_revision(idea_id=idea_id, artifact_name=artifact_name, content="First", provenance="agent")

    # Delete the previous file to simulate a missing file
    os.remove(record1["path"])

    # Second revision
    record2 = save_artifact_revision(idea_id=idea_id, artifact_name=artifact_name, content="Second", provenance="agent")

    # Since previous file is missing, diff should be as if comparing against empty content
    assert record2["version"] == 2
    assert "-First" not in record2["diff"]
    assert "+Second" in record2["diff"]


def test_save_artifact_revision_trust_and_evidence_refs(patch_config):
    idea_id = "IDEA-0001"
    artifact_name = "test_artifact"

    save_idea_yaml(idea_id, "idea.yaml", {})

    record = save_artifact_revision(
        idea_id=idea_id,
        artifact_name=artifact_name,
        content="Test content",
        provenance="user",
        trust="verified",
        evidence_refs=["ref1", "ref2"],
    )

    assert record["trust"] == "verified"
    assert record["evidence_refs"] == ["ref1", "ref2"]

    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    meta = idea_data["artifact_revisions"][artifact_name]
    assert meta["trust"] == "verified"
