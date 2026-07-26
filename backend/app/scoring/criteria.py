"""Criterion evaluators for the 7 scoring dimensions.

Uses LLM-powered evaluation instead of heuristic field-counting.
"""

from ..models.idea import ScoreBreakdown
from ..storage.yaml_io import load_idea_yaml
from ..llm.subagent_executor import execute_llm_scoring


class CriterionEvaluator:
    """Evaluates all 7 criteria for an idea using LLM analysis."""

    def __init__(self, idea_id: str):
        self.idea_id = idea_id
        self.idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}

    def evaluate_all(self) -> ScoreBreakdown:
        """Run LLM-powered scoring across all 7 criteria.

        Falls back to heuristic scoring if the LLM call fails.
        """
        try:
            result = execute_llm_scoring(self.idea_id)
        except Exception:
            # Fallback to heuristic scoring
            return self._heuristic_fallback()

        criteria = result.get("criteria", result) if isinstance(result, dict) else result
        return ScoreBreakdown(
            novelty=self._get_score(criteria, "novelty"),
            siemens_alignment=self._get_score(criteria, "siemens_alignment")
            or self._get_score(criteria, "Siemens Strategic Alignment"),
            technical_feasibility=self._get_score(criteria, "technical_feasibility")
            or self._get_score(criteria, "Technical Feasibility"),
            detectability=self._get_score(criteria, "detectability"),
            business_value=self._get_score(criteria, "business_value")
            or self._get_score(criteria, "Business Value"),
            originality=self._get_score(criteria, "originality"),
            completeness=self._get_score(criteria, "completeness"),
        )

    def _get_score(self, data: dict, key: str) -> float:
        """Extract score from various possible key formats."""
        # Handle list data — skip to numeric index fallback
        if isinstance(data, list):
            return self._score_from_list(data, key)
        if key in data:
            item = data[key]
            if isinstance(item, dict):
                return float(item.get("score", 50))
            if isinstance(item, (int, float)):
                return float(item)
        # Try case-insensitive match
        for k, v in data.items():
            if k.lower().replace(" ", "_") == key.lower().replace(" ", "_"):
                if isinstance(v, dict):
                    return float(v.get("score", 50))
                if isinstance(v, (int, float)):
                    return float(v)
        # Try numeric index
        index_map = {"novelty": 0, "siemens_alignment": 1, "technical_feasibility": 2,
                     "detectability": 3, "business_value": 4, "originality": 5, "completeness": 6}
        if key in index_map and isinstance(data, list):
            idx = index_map[key]
            if idx < len(data):
                item = data[idx]
                if isinstance(item, dict):
                    return float(item.get("score", 50))
                if isinstance(item, (int, float)):
                    return float(item)
        return 50.0

    def _score_from_list(self, data: list, key: str) -> float:
        """Extract score from a list of dicts (e.g., [{'criterion':'novelty','score':75}])."""
        index_map = {"novelty": 0, "siemens_alignment": 1, "technical_feasibility": 2,
                     "detectability": 3, "business_value": 4, "originality": 5, "completeness": 6}
        # Try numeric index
        idx = index_map.get(key)
        if idx is not None and idx < len(data):
            item = data[idx]
            if isinstance(item, dict):
                score = item.get("score") or item.get(key, 50)
                return float(score)
            if isinstance(item, (int, float)):
                return float(item)
        # Try by criterion key
        for item in data:
            if isinstance(item, dict):
                name = (item.get("criterion") or item.get("name") or "").lower().replace(" ", "_")
                if name == key.lower().replace(" ", "_"):
                    return float(item.get("score", 50))
                if key in item:
                    val = item[key]
                    return float(val) if isinstance(val, (int, float)) else float(item.get("score", 50))
        return 50.0

    def _heuristic_fallback(self) -> ScoreBreakdown:
        """Fallback heuristic scoring if LLM is unavailable."""
        data = self.idea_data
        fields_filled = sum(1 for f in ["title", "problem_statement", "solution_concept",
                                         "siemens_domain", "tags"] if data.get(f))
        completeness = (fields_filled / 5) * 100

        return ScoreBreakdown(
            novelty=55.0 if data.get("solution_concept") else 40.0,
            siemens_alignment=60.0 if data.get("siemens_domain") else 40.0,
            technical_feasibility=55.0 if data.get("solution_concept") else 35.0,
            detectability=50.0,
            business_value=50.0 if data.get("siemens_domain") else 35.0,
            originality=50.0,
            completeness=completeness,
        )
