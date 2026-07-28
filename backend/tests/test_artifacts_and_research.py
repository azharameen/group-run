"""Tests for artifact revisions, duplicate detection, and research adapters."""

import os

from app.agent.tools import draft_patent_section
from app.orchestrator.tools import detect_duplicate_ideas, build_review_packet, get_prior_art_sources
from app.storage.artifacts import load_artifact_revisions, build_artifact_comparison
from app.storage.yaml_io import create_idea_folder, save_idea_yaml


def test_duplicate_detection_flags_similar_idea(patch_config):
    existing_id = "IDEA-2001"
    create_idea_folder(existing_id)
    save_idea_yaml(existing_id, "idea.yaml", {
        "idea_id": existing_id,
        "title": "Industrial Edge Predictive Maintenance",
        "signal_text": "Predictive maintenance using edge AI for rotating equipment",
        "problem_statement": "Reduce downtime on industrial equipment",
        "solution_concept": "Edge AI anomaly detection",
    })

    assessment = detect_duplicate_ideas(
        "Predictive maintenance using edge AI for rotating equipment",
        "Industrial Edge Predictive Maintenance",
    )

    assert assessment["is_duplicate"] is True
    assert assessment["matches"][0]["idea_id"] == existing_id


def test_artifact_revision_persistence_and_diff(patch_config):
    idea_id = "IDEA-2002"
    create_idea_folder(idea_id)
    save_idea_yaml(idea_id, "idea.yaml", {"idea_id": idea_id, "title": "Revision Test"})

    draft_patent_section(idea_id, "ideascope_draft", "Draft v1")
    draft_patent_section(idea_id, "ideascope_draft", "Draft v2 with more detail")

    revisions = load_artifact_revisions(idea_id)
    assert len(revisions) == 2
    comparison = build_artifact_comparison(idea_id, "ideascope_draft")
    assert comparison["available"] is True
    assert "Draft v1" in comparison["content_a"]
    assert "Draft v2" in comparison["content_b"]


def test_review_packet_writes_revision(patch_config):
    idea_id = "IDEA-2003"
    create_idea_folder(idea_id)
    save_idea_yaml(idea_id, "idea.yaml", {
        "idea_id": idea_id,
        "title": "Packet Test",
        "problem_statement": "Test problem",
        "source_evidence": ["Evidence A"],
    })

    packet = build_review_packet(idea_id, "manager")
    assert packet["reviewer_role"] == "manager"
    revisions = load_artifact_revisions(idea_id)
    assert any(r["artifact_name"] == "review-packet-manager" for r in revisions)


def test_prior_art_sources_use_local_taxonomy(patch_config):
    result = get_prior_art_sources("predictive maintenance edge ai", limit=3)
    assert result["count"] >= 1
    assert any(src["trust"] in {"trusted-local", "public-web"} for src in result["sources"])
