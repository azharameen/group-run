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
        breakdown, criteria_detail, summary = self.evaluator.evaluate_all_detailed()
        composite, rating = compute_composite(breakdown)

        scores_data = load_idea_yaml(self.idea_id, "scores.yaml") or {
            "idea_id": self.idea_id,
            "history": [],
        }
        previous = scores_data["history"][-1] if scores_data.get("history") else None
        change_explanation = self._build_change_explanation(
            previous=previous,
            current_breakdown=breakdown,
            current_composite=composite,
            current_summary=summary,
            current_details=criteria_detail,
        )

        record = ScoreRecord(
            timestamp=datetime.utcnow(),
            composite=composite,
            breakdown=breakdown,
            criteria_detail=criteria_detail,
            strength_rating=rating,
            summary=summary,
            change_explanation=change_explanation,
            agent_responsible=agent_name,
        )

        # Save to scores.yaml
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

    def _build_change_explanation(
        self,
        *,
        previous: dict | None,
        current_breakdown: ScoreBreakdown,
        current_composite: float,
        current_summary: str,
        current_details: dict[str, object],
    ) -> str:
        """Summarize how this score differs from the previous recorded score."""
        if not previous:
            return (
                f"Initial recorded score. Composite {current_composite}. "
                f"Summary: {current_summary}"
            )

        prev_breakdown = previous.get("breakdown", {}) if isinstance(previous, dict) else {}
        prev_composite = float(previous.get("composite", 0) or 0) if isinstance(previous, dict) else 0.0

        deltas: list[str] = []
        for field in [
            "novelty",
            "siemens_alignment",
            "technical_feasibility",
            "detectability",
            "business_value",
            "originality",
            "completeness",
        ]:
            current_value = getattr(current_breakdown, field)
            previous_value = float(prev_breakdown.get(field, 0) or 0) if isinstance(prev_breakdown, dict) else 0.0
            delta = round(current_value - previous_value, 1)
            if delta:
                detail = current_details.get(field)
                reasoning = getattr(detail, "reasoning", "") if detail else ""
                suffix = f" Reason: {reasoning}" if reasoning else ""
                deltas.append(f"{field.replace('_', ' ').title()} {delta:+.1f}.{suffix}")

        if not deltas:
            deltas.append("No material changes from the previous score were detected.")

        return (
            f"Composite changed {current_composite - prev_composite:+.1f} "
            f"from {prev_composite:.1f} to {current_composite:.1f}. "
            + " ".join(deltas)
            + f" Current summary: {current_summary}"
        )
