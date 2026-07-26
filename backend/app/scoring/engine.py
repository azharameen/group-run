"""Weighted scoring engine for patent idea evaluation.

7 criteria, each weighted 0-100%, adjustable in system-config.yaml.
Composite = sum(score × weight) for all criteria.
"""

import os
from datetime import datetime
from typing import Optional

import yaml

from ..config import CONFIG_DIR, settings
from ..models.idea import ScoreRecord, ScoreBreakdown
from ..storage.yaml_io import load_idea_yaml, save_idea_yaml
from .criteria import CriterionEvaluator


WEIGHTS_KEY = "scoring.criteria"
STRENGTH_KEY = "scoring.strength_ratings"


def load_weights() -> dict[str, float]:
    """Load criteria weights from system-config.yaml."""
    path = os.path.join(CONFIG_DIR, "system-config.yaml")
    if not os.path.exists(path):
        return _default_weights()
    with open(path, "r") as f:
        config = yaml.safe_load(f)
    criteria = config.get("scoring", {}).get("criteria", {})
    return {
        "novelty": criteria.get("novelty", {}).get("weight", 0.25),
        "siemens_alignment": criteria.get("siemens_alignment", {}).get("weight", 0.15),
        "technical_feasibility": criteria.get("technical_feasibility", {}).get("weight", 0.15),
        "detectability": criteria.get("detectability", {}).get("weight", 0.10),
        "business_value": criteria.get("business_value", {}).get("weight", 0.15),
        "originality": criteria.get("originality", {}).get("weight", 0.10),
        "completeness": criteria.get("completeness", {}).get("weight", 0.10),
    }


def _default_weights() -> dict[str, float]:
    return {
        "novelty": 0.25,
        "siemens_alignment": 0.15,
        "technical_feasibility": 0.15,
        "detectability": 0.10,
        "business_value": 0.15,
        "originality": 0.10,
        "completeness": 0.10,
    }


def load_strength_ratings() -> list[dict]:
    """Load strength rating thresholds from config."""
    path = os.path.join(CONFIG_DIR, "system-config.yaml")
    if not os.path.exists(path):
        return [
            {"min": 85, "label": "Very Strong", "action": "Fast-track Siemens filing"},
            {"min": 70, "label": "Strong", "action": "Auto-promote to drafting"},
            {"min": 50, "label": "Moderate", "action": "Route for improvement pass"},
            {"min": 30, "label": "Weak", "action": "Hold for significant improvement"},
            {"min": 0, "label": "Reject", "action": "Archive with learning"},
        ]
    with open(path, "r") as f:
        config = yaml.safe_load(f)
    ratings = config.get("scoring", {}).get("strength_ratings", {})
    result = []
    for key, val in ratings.items():
        result.append({
            "min": val.get("min", 0),
            "label": key.replace("_", " ").title(),
            "action": val.get("action", ""),
        })
    return sorted(result, key=lambda r: r["min"], reverse=True)


def compute_composite(breakdown: ScoreBreakdown) -> tuple[float, str]:
    """Compute composite score and strength rating."""
    weights = load_weights()
    composite = (
        breakdown.novelty * weights["novelty"]
        + breakdown.siemens_alignment * weights["siemens_alignment"]
        + breakdown.technical_feasibility * weights["technical_feasibility"]
        + breakdown.detectability * weights["detectability"]
        + breakdown.business_value * weights["business_value"]
        + breakdown.originality * weights["originality"]
        + breakdown.completeness * weights["completeness"]
    )

    ratings = load_strength_ratings()
    rating = "Unknown"
    for r in ratings:
        if composite >= r["min"]:
            rating = r["label"]
            break

    return round(composite, 1), rating


class ScoringEngine:
    """Orchestrates scoring of an idea across all 7 criteria."""

    def __init__(self, idea_id: str):
        self.idea_id = idea_id
        self.evaluator = CriterionEvaluator(idea_id)

    def score(self, agent_name: str = "scoring-engine") -> ScoreRecord:
        """Run all criteria evaluations and save results."""
        breakdown = self.evaluator.evaluate_all()
        composite, rating = compute_composite(breakdown)

        record = ScoreRecord(
            timestamp=datetime.utcnow(),
            composite=composite,
            breakdown=breakdown,
            strength_rating=rating,
            agent_responsible=agent_name,
        )

        # Save to scores.yaml
        scores_data = load_idea_yaml(self.idea_id, "scores.yaml") or {
            "idea_id": self.idea_id,
            "history": [],
        }
        scores_data["history"].append(record.model_dump(mode="json"))
        scores_data["latest"] = record.model_dump(mode="json")
        save_idea_yaml(self.idea_id, "scores.yaml", scores_data)

        return record

    def meets_threshold(self) -> tuple[bool, str]:
        """Check if idea meets the minimum filing threshold."""
        scores_data = load_idea_yaml(self.idea_id, "scores.yaml")
        if not scores_data or "latest" not in scores_data:
            return False, "No scores recorded"

        latest = scores_data["latest"]
        composite = latest.get("composite", 0)

        if composite < settings.composite_threshold:
            return False, (
                f"Composite score {composite} < threshold {settings.composite_threshold}"
            )

        # Check no gate below threshold
        threshold_pct = settings.gate_threshold_percent
        bd = latest.get("breakdown", {})
        for criterion, min_val in [
            ("novelty", 50),
            ("siemens_alignment", 50),
            ("completeness", 50),
        ]:
            if bd.get(criterion, 0) < min_val:
                return False, f"{criterion} score {bd.get(criterion, 0)} < {min_val}%"

        return True, "Meets all thresholds"
