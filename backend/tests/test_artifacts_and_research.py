"""Tests for artifact revisions, duplicate detection, and research adapters."""

import json
import os

from app.agent.domain_tools import draft_patent_section
from app.orchestrator.workflow_tools import detect_duplicate_ideas, build_review_packet, get_prior_art_sources
from app.research.adapters import search_public_patents
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
    assert any(src["trust"] in {"trusted-local", "public-api"} for src in result["sources"])


def test_public_patent_api_parses_structured_results(monkeypatch):
    payload = {
        "results": {
            "cluster": [
                {
                    "result": [
                        {
                            "id": "patent/US1234567A/en",
                            "patent": {
                                "title": "A <b>wireless</b> sensor platform",
                                "snippet": "A sensor platform for <b>wireless</b> monitoring.",
                                "publication_number": "US1234567A",
                            },
                        }
                    ]
                }
            ]
        }
    }

    class DummyResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(payload).encode("utf-8")

    monkeypatch.setattr("app.research.adapters.urllib.request.urlopen", lambda *args, **kwargs: DummyResponse())

    results = search_public_patents("wireless sensor", limit=1)
    assert len(results) == 1
    assert results[0].source_type == "public-patent-api"
    assert results[0].trust == "public-api"
    assert results[0].title == "A wireless sensor platform"
    assert results[0].snippet == "A sensor platform for wireless monitoring."
    assert results[0].url.endswith("/US1234567A/en")
