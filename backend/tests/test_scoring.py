"""Tests for the scoring engine."""

import os

import pytest
import yaml

from app.models.idea import ScoreBreakdown, ScoreRecord, CriterionDetail
from app.scoring.engine import ScoringEngine, compute_composite, load_weights
from app.scoring.criteria import CriterionEvaluator
from app.storage.yaml_io import create_idea_folder, save_idea_yaml


@pytest.fixture
def seeded_idea(patch_config):
    """Create a minimal idea with enough data for scoring."""
    idea_id = "IDEA-SCORE-001"
    create_idea_folder(idea_id)
    data = {
        "title": "Edge AI Predictive Maintenance",
        "problem_statement": "Industrial rotating equipment failures cause unplanned downtime.",
        "solution_concept": "Self-calibrating edge neural network with cross-modal sensor fusion.",
        "siemens_domain": "Industrial Edge Computing",
        "tags": ["edge", "AI", "predictive"],
        "discovery_data": {
            "technical_domain": "Edge Computing",
            "problem_background": "Traditional monitoring relies on cloud processing.",
            "innovation_aspects": ["Self-calibrating edge NN", "Cross-modal fusion"],
        },
    }
    save_idea_yaml(idea_id, "idea.yaml", data)
    return idea_id


class TestComputeComposite:
    def test_compute_composite(self):
        """Composite should be a weighted sum of all criteria."""
        breakdown = ScoreBreakdown(
            novelty=80,
            siemens_alignment=70,
            technical_feasibility=60,
            detectability=50,
            business_value=75,
            originality=65,
            completeness=55,
        )
        composite, rating = compute_composite(breakdown)
        assert 0 <= composite <= 100
        assert rating in ("Very Strong", "Strong", "Moderate", "Weak", "Reject")

    def test_perfect_score(self):
        """All 100s should yield Very Strong."""
        breakdown = ScoreBreakdown(
            novelty=100, siemens_alignment=100, technical_feasibility=100,
            detectability=100, business_value=100, originality=100, completeness=100,
        )
        composite, rating = compute_composite(breakdown)
        assert composite == 100.0
        assert rating == "Very Strong"


class TestCriterionEvaluator:
    def test_heuristic_fallback(self, seeded_idea):
        """When LLM is unavailable, heuristic fallback should produce valid scores."""
        evaluator = CriterionEvaluator(seeded_idea)
        breakdown = evaluator.evaluate_all()
        assert isinstance(breakdown, ScoreBreakdown)
        assert 0 <= breakdown.novelty <= 100
        assert 0 <= breakdown.siemens_alignment <= 100

    def test_detailed_fallback(self, seeded_idea):
        """Heuristic fallback should also produce criteria_detail and summary."""
        evaluator = CriterionEvaluator(seeded_idea)
        breakdown, details, summary = evaluator.evaluate_all_detailed()
        assert isinstance(breakdown, ScoreBreakdown)
        assert isinstance(details, dict)
        assert "novelty" in details
        assert isinstance(details["novelty"], CriterionDetail)
        assert isinstance(summary, str)
        assert len(summary) > 0


class TestScoringEngine:
    def test_score_creates_record(self, seeded_idea):
        """Scoring should produce a ScoreRecord with all fields."""
        engine = ScoringEngine(seeded_idea)
        record = engine.score(agent_name="test")
        assert isinstance(record, ScoreRecord)
        assert record.composite > 0
        assert record.strength_rating in ("Very Strong", "Strong", "Moderate", "Weak", "Reject")
        assert isinstance(record.breakdown, ScoreBreakdown)

    def test_score_persists_to_yaml(self, seeded_idea, patch_config):
        """After scoring, scores.yaml should exist with history."""
        engine = ScoringEngine(seeded_idea)
        engine.score(agent_name="test")

        scores_path = os.path.join(patch_config, "ideas", seeded_idea, "scores.yaml")
        assert os.path.exists(scores_path)

        with open(scores_path) as f:
            scores_data = yaml.safe_load(f)
        assert "history" in scores_data
        assert len(scores_data["history"]) == 1
        assert "latest" in scores_data

    def test_meets_threshold_no_scores(self, seeded_idea):
        """Without any scores, meets_threshold should return False."""
        engine = ScoringEngine(seeded_idea)
        meets, reason = engine.meets_threshold()
        assert meets is False
        assert "No scores" in reason

    def test_meets_threshold_after_scoring(self, seeded_idea):
        """After scoring, meets_threshold should return a valid result."""
        engine = ScoringEngine(seeded_idea)
        engine.score(agent_name="test")
        meets, reason = engine.meets_threshold()
        # Result depends on actual scores, but should be a bool
        assert isinstance(meets, bool)
        assert isinstance(reason, str)

    def test_score_history_accumulates(self, seeded_idea, patch_config):
        """Multiple scores should accumulate in history."""
        engine = ScoringEngine(seeded_idea)
        engine.score(agent_name="first")
        engine.score(agent_name="second")

        scores_path = os.path.join(patch_config, "ideas", seeded_idea, "scores.yaml")
        with open(scores_path) as f:
            scores_data = yaml.safe_load(f)
        assert len(scores_data["history"]) == 2

    def test_change_explanation_on_first_score(self, seeded_idea):
        """The first score should have an 'initial' change explanation."""
        engine = ScoringEngine(seeded_idea)
        record = engine.score(agent_name="test")
        assert "Initial" in record.change_explanation or "initial" in record.change_explanation.lower()
