"""Tests for artifact comparison storage logic."""

from unittest.mock import patch

from app.storage.artifacts import build_artifact_comparison


@patch("app.storage.artifacts.load_artifact_revisions")
def test_build_artifact_comparison_no_revisions(mock_load_artifact_revisions):
    """When there are 0 revisions, it should return available: False and an empty revisions list."""
    mock_load_artifact_revisions.return_value = []

    result = build_artifact_comparison("IDEA-123", "test_artifact")

    assert result["artifact_name"] == "test_artifact"
    assert result["available"] is False
    assert result["revisions"] == []
    mock_load_artifact_revisions.assert_called_once_with("IDEA-123")


@patch("app.storage.artifacts.load_artifact_revisions")
def test_build_artifact_comparison_one_revision(mock_load_artifact_revisions):
    """When there is 1 revision, it should return available: False and a list with the single revision."""
    mock_load_artifact_revisions.return_value = [{"artifact_name": "test_artifact", "version": 1}]

    result = build_artifact_comparison("IDEA-123", "test_artifact")

    assert result["artifact_name"] == "test_artifact"
    assert result["available"] is False
    assert result["revisions"] == [{"artifact_name": "test_artifact", "version": 1}]


@patch("app.storage.artifacts.load_artifact_revisions")
def test_build_artifact_comparison_two_revisions(mock_load_artifact_revisions):
    """When there are exactly 2 revisions, it should return available: True and properly extract latest, previous, content_a, content_b, and diff."""
    mock_load_artifact_revisions.return_value = [
        {"artifact_name": "test_artifact", "version": 1, "content": "hello", "diff": "diff1"},
        {"artifact_name": "test_artifact", "version": 2, "content": "hello world", "diff": "diff2"},
    ]

    result = build_artifact_comparison("IDEA-123", "test_artifact")

    assert result["artifact_name"] == "test_artifact"
    assert result["available"] is True
    assert result["latest"] == {
        "artifact_name": "test_artifact",
        "version": 2,
        "content": "hello world",
        "diff": "diff2",
    }
    assert result["previous"] == {"artifact_name": "test_artifact", "version": 1, "content": "hello", "diff": "diff1"}
    assert result["content_a"] == "hello"
    assert result["content_b"] == "hello world"
    assert result["diff"] == "diff2"


@patch("app.storage.artifacts.load_artifact_revisions")
def test_build_artifact_comparison_multiple_revisions(mock_load_artifact_revisions):
    """When there are >2 revisions, it should correctly pick the last two."""
    mock_load_artifact_revisions.return_value = [
        {"artifact_name": "test_artifact", "version": 1, "content": "v1"},
        {"artifact_name": "test_artifact", "version": 2, "content": "v2", "diff": "diff2"},
        {"artifact_name": "test_artifact", "version": 3, "content": "v3", "diff": "diff3"},
    ]

    result = build_artifact_comparison("IDEA-123", "test_artifact")

    assert result["artifact_name"] == "test_artifact"
    assert result["available"] is True
    assert result["latest"] == {"artifact_name": "test_artifact", "version": 3, "content": "v3", "diff": "diff3"}
    assert result["previous"] == {"artifact_name": "test_artifact", "version": 2, "content": "v2", "diff": "diff2"}
    assert result["content_a"] == "v2"
    assert result["content_b"] == "v3"
    assert result["diff"] == "diff3"


@patch("app.storage.artifacts.load_artifact_revisions")
def test_build_artifact_comparison_filters_by_name(mock_load_artifact_revisions):
    """Verify that it correctly ignores revisions that belong to other artifact_names."""
    mock_load_artifact_revisions.return_value = [
        {"artifact_name": "test_artifact", "version": 1, "content": "v1"},
        {"artifact_name": "other_artifact", "version": 1, "content": "other1"},
        {"artifact_name": "test_artifact", "version": 2, "content": "v2", "diff": "diff2"},
        {"artifact_name": "other_artifact", "version": 2, "content": "other2"},
    ]

    result = build_artifact_comparison("IDEA-123", "test_artifact")

    assert result["artifact_name"] == "test_artifact"
    assert result["available"] is True
    assert result["latest"] == {"artifact_name": "test_artifact", "version": 2, "content": "v2", "diff": "diff2"}
    assert result["previous"] == {"artifact_name": "test_artifact", "version": 1, "content": "v1"}
    assert result["content_a"] == "v1"
    assert result["content_b"] == "v2"
    assert result["diff"] == "diff2"
