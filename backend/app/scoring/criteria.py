"""Criterion evaluators for the 7 scoring dimensions."""

from ..models.idea import CriterionDetail, ScoreBreakdown
from ..storage.yaml_io import load_idea_yaml
from ..llm.subagent_executor import execute_llm_scoring


class CriterionEvaluator:
    """Evaluates all 7 criteria for an idea using LLM analysis."""

    def __init__(self, idea_id: str):
        self.idea_id = idea_id
        self.idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}

    def evaluate_all(self) -> ScoreBreakdown:
        """Run LLM-powered scoring across all 7 criteria."""
        breakdown, _, _ = self.evaluate_all_detailed()
        return breakdown

    def evaluate_all_detailed(self) -> tuple[ScoreBreakdown, dict[str, CriterionDetail], str]:
        """Run scoring and preserve criterion reasoning plus the summary."""
        result = execute_llm_scoring(self.idea_id)

        criteria = result.get("criteria", result) if isinstance(result, dict) else result
        breakdown = ScoreBreakdown(
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

        detail_map = {
            "novelty": self._get_detail(criteria, "novelty", breakdown.novelty),
            "siemens_alignment": self._get_detail(
                criteria, "siemens_alignment", breakdown.siemens_alignment
            ),
            "technical_feasibility": self._get_detail(
                criteria, "technical_feasibility", breakdown.technical_feasibility
            ),
            "detectability": self._get_detail(criteria, "detectability", breakdown.detectability),
            "business_value": self._get_detail(criteria, "business_value", breakdown.business_value),
            "originality": self._get_detail(criteria, "originality", breakdown.originality),
            "completeness": self._get_detail(criteria, "completeness", breakdown.completeness),
        }
        summary = self._extract_summary(result, criteria)
        return breakdown, detail_map, summary

    def _get_score(self, data: dict, key: str) -> float:
        """Extract score from various possible key formats."""
        # Handle list data — skip to numeric index fallback
        if isinstance(data, list):
            return self._score_from_list(data, key)
        if key in data:
            item = data[key]
            if isinstance(item, dict):
                if "score" not in item:
                    raise ValueError(f"Scoring model did not return a score for '{key}'.")
                return float(item["score"])
            if isinstance(item, (int, float)):
                return float(item)
        # Try case-insensitive match
        for k, v in data.items():
            if k.lower().replace(" ", "_") == key.lower().replace(" ", "_"):
                if isinstance(v, dict):
                    if "score" not in v:
                        raise ValueError(f"Scoring model did not return a score for '{key}'.")
                    return float(v["score"])
                if isinstance(v, (int, float)):
                    return float(v)
        raise ValueError(f"Scoring model did not return a score for '{key}'.")

    def _get_detail(self, data: dict, key: str, score: float) -> CriterionDetail:
        """Extract reasoning and confidence alongside the score."""
        item = self._get_criterion_item(data, key)
        if isinstance(item, dict):
            return CriterionDetail(
                score=float(item.get("score", score)),
                reasoning=str(item.get("reasoning") or item.get("rationale") or "").strip(),
                confidence=float(item.get("confidence", 0) or 0),
            )
        raise ValueError(f"Scoring model did not return reasoning for '{key}'.")

    def _get_criterion_item(self, data: dict, key: str) -> dict | None:
        """Extract the raw criterion object from dict/list response formats."""
        if isinstance(data, list):
            index_map = {
                "novelty": 0,
                "siemens_alignment": 1,
                "technical_feasibility": 2,
                "detectability": 3,
                "business_value": 4,
                "originality": 5,
                "completeness": 6,
            }
            idx = index_map.get(key)
            if idx is not None and idx < len(data):
                item = data[idx]
                return item if isinstance(item, dict) else {"score": item}
            for item in data:
                if isinstance(item, dict):
                    name = (item.get("criterion") or item.get("name") or "").lower().replace(" ", "_")
                    if name == key.lower().replace(" ", "_"):
                        return item
                    if key in item:
                        value = item[key]
                        return value if isinstance(value, dict) else {"score": value}
            return None

        if key in data:
            item = data[key]
            return item if isinstance(item, dict) else {"score": item}

        for k, v in data.items():
            if k.lower().replace(" ", "_") == key.lower().replace(" ", "_"):
                return v if isinstance(v, dict) else {"score": v}

        return None

    def _extract_summary(self, result: dict, criteria: dict) -> str:
        """Extract the overall summary from known response shapes."""
        if isinstance(result, dict):
            summary = result.get("summary")
            if isinstance(summary, str) and summary.strip():
                return summary.strip()
        if isinstance(criteria, dict):
            summary = criteria.get("summary")
            if isinstance(summary, str) and summary.strip():
                return summary.strip()
        raise ValueError("Scoring model did not return a summary.")

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
                    if "score" not in item:
                        raise ValueError(f"Scoring model did not return a score for '{key}'.")
                    return float(item["score"])
                if key in item:
                    val = item[key]
                    if isinstance(val, (int, float)):
                        return float(val)
                    if isinstance(val, dict) and "score" in val:
                        return float(val["score"])
                    raise ValueError(f"Scoring model did not return a score for '{key}'.")
        raise ValueError(f"Scoring model did not return a score for '{key}'.")
