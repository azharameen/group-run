"""Criterion evaluators for the 7 scoring dimensions.

Uses LLM-powered evaluation instead of heuristic field-counting.
"""

from ..models.idea import CriterionDetail, ScoreBreakdown
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
        breakdown, _, _ = self.evaluate_all_detailed()
        return breakdown

    def evaluate_all_detailed(self) -> tuple[ScoreBreakdown, dict[str, CriterionDetail], str]:
        """Run scoring and preserve criterion reasoning plus the summary."""
        try:
            result = execute_llm_scoring(self.idea_id)
        except Exception:
            breakdown = self._heuristic_fallback()
            details = self._heuristic_details(breakdown)
            return breakdown, details, self._heuristic_summary(breakdown)

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

    def _get_detail(self, data: dict, key: str, score: float) -> CriterionDetail:
        """Extract reasoning and confidence alongside the score."""
        item = self._get_criterion_item(data, key)
        if isinstance(item, dict):
            return CriterionDetail(
                score=float(item.get("score", score)),
                reasoning=str(item.get("reasoning") or item.get("rationale") or "").strip(),
                confidence=float(item.get("confidence", 0) or 0),
            )
        return CriterionDetail(
            score=score,
            reasoning="No criterion reasoning was returned by the scoring model.",
            confidence=0.0,
        )

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
        return "No scoring summary was returned by the model."

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
        """Fallback heuristic scoring if LLM is unavailable.

        This uses content depth and workflow completeness rather than simple
        field presence, so the fallback is still a useful signal instead of a
        glorified checkbox counter.
        """
        data = self.idea_data
        title = str(data.get("title", "")).strip()
        problem = str(data.get("problem_statement", "")).strip()
        solution = str(data.get("solution_concept", "")).strip()
        domain = str(data.get("siemens_domain", "")).strip()
        tags = data.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        source_evidence = data.get("source_evidence", [])
        if isinstance(source_evidence, str):
            source_evidence = [source_evidence]
        elif not isinstance(source_evidence, list):
            source_evidence = []
        evidence_items = [str(item).strip() for item in source_evidence if str(item).strip()]

        novelty_hypothesis = data.get("novelty_hypothesis", {})
        if not isinstance(novelty_hypothesis, dict):
            novelty_hypothesis = {}
        prior_art_review = data.get("prior_art_review", {})
        if not isinstance(prior_art_review, dict):
            prior_art_review = {}
        siemens_alignment_review = data.get("siemens_alignment", {})
        if not isinstance(siemens_alignment_review, dict):
            siemens_alignment_review = {}
        ideascope_draft = data.get("ideascope_draft", {})
        if not isinstance(ideascope_draft, dict):
            ideascope_draft = {}
        detectability_review = data.get("detectability_review", {})
        if not isinstance(detectability_review, dict):
            detectability_review = {}
        business_value_review = data.get("business_value", {})
        if not isinstance(business_value_review, dict):
            business_value_review = {}

        completeness_flags = [
            len(title) >= 8,
            len(problem) >= 40,
            len(solution) >= 60,
            bool(domain),
            len(tags) >= 3,
            len(evidence_items) >= 2,
            bool(data.get("discovery_data")),
            bool(data.get("clarification_data")),
            bool(novelty_hypothesis),
            bool(prior_art_review),
            bool(detectability_review),
            bool(business_value_review),
            bool(siemens_alignment_review),
            bool(ideascope_draft),
        ]
        completeness = (sum(1 for flag in completeness_flags if flag) / len(completeness_flags)) * 100

        solution_tokens = len(solution.split())
        novelty = 35.0
        if solution_tokens >= 20:
            novelty += 10.0
        if solution_tokens >= 80:
            novelty += 10.0
        if bool(novelty_hypothesis.get("differentiating_features")):
            novelty += 10.0
        if bool(prior_art_review.get("gap_analysis")):
            novelty += 5.0

        siemens_alignment = 30.0
        if domain:
            siemens_alignment += 15.0
        if any(term in domain.lower() for term in ["smart", "energy", "automation", "grid", "infrastructure", "mobility", "digital", "industry"]):
            siemens_alignment += 10.0
        if bool(siemens_alignment_review.get("aligned_strategic_areas")):
            siemens_alignment += 10.0

        technical_feasibility = 30.0
        if solution_tokens >= 50:
            technical_feasibility += 15.0
        if solution_tokens >= 120:
            technical_feasibility += 10.0
        if bool(ideascope_draft.get("claims")):
            technical_feasibility += 10.0

        detectability = 30.0
        detectability_text = str(detectability_review.get("detectability_notes", "")).lower()
        if any(term in solution.lower() for term in ["sensor", "telemetry", "log", "measure", "monitor", "detect", "trace"]):
            detectability += 10.0
        if any(term in detectability_text for term in ["monitor", "logs", "telemetry", "signal", "trace"]):
            detectability += 10.0

        business_value = 30.0
        market_impact = str(business_value_review.get("market_impact", "")).lower()
        if domain:
            business_value += 10.0
        if any(term in market_impact for term in ["downtime", "reliability", "efficiency", "cost", "revenue", "market", "uptime"]):
            business_value += 10.0

        originality = 30.0
        if solution_tokens >= 40:
            originality += 10.0
        if bool(novelty_hypothesis.get("novelty_elements")):
            originality += 10.0
        if bool(prior_art_review.get("references_found")):
            originality += 5.0

        return ScoreBreakdown(
            novelty=min(100.0, novelty),
            siemens_alignment=min(100.0, siemens_alignment),
            technical_feasibility=min(100.0, technical_feasibility),
            detectability=min(100.0, detectability),
            business_value=min(100.0, business_value),
            originality=min(100.0, originality),
            completeness=completeness,
        )

    def _heuristic_details(self, breakdown: ScoreBreakdown) -> dict[str, CriterionDetail]:
        """Build simple explanations for heuristic fallback scores."""
        data = self.idea_data
        title = str(data.get("title", "")).strip() or "untitled idea"
        domain = str(data.get("siemens_domain", "")).strip() or "unspecified domain"
        solution_words = len(str(data.get("solution_concept", "")).split())
        evidence_count = len(data.get("source_evidence", [])) if isinstance(data.get("source_evidence", []), list) else 0
        return {
            "novelty": CriterionDetail(
                score=breakdown.novelty,
                reasoning=f"Heuristic fallback: novelty estimated from the depth of '{title}' and its novelty signals.",
                confidence=45.0,
            ),
            "siemens_alignment": CriterionDetail(
                score=breakdown.siemens_alignment,
                reasoning=f"Heuristic fallback: Siemens alignment estimated from domain context '{domain}'.",
                confidence=45.0,
            ),
            "technical_feasibility": CriterionDetail(
                score=breakdown.technical_feasibility,
                reasoning=f"Heuristic fallback: feasibility estimated from solution depth ({solution_words} words) and draft readiness.",
                confidence=40.0,
            ),
            "detectability": CriterionDetail(
                score=breakdown.detectability,
                reasoning="Heuristic fallback: detectability estimated from monitoring/logging language and detection review content.",
                confidence=35.0,
            ),
            "business_value": CriterionDetail(
                score=breakdown.business_value,
                reasoning=f"Heuristic fallback: business value estimated from domain fit and source evidence count ({evidence_count}).",
                confidence=40.0,
            ),
            "originality": CriterionDetail(
                score=breakdown.originality,
                reasoning="Heuristic fallback: originality estimated from concept richness and prior-art review signals.",
                confidence=30.0,
            ),
            "completeness": CriterionDetail(
                score=breakdown.completeness,
                reasoning="Heuristic fallback: completeness estimated from populated workflow sections and evidence.",
                confidence=55.0,
            ),
        }

    def _heuristic_summary(self, breakdown: ScoreBreakdown) -> str:
        """Build a plain-language summary for heuristic scoring."""
        return (
            "Heuristic fallback scoring was used because the LLM scoring path was unavailable. "
            f"The estimate is based on solution depth, supporting evidence, and workflow completion; "
            f"current values are novelty {breakdown.novelty}, Siemens alignment {breakdown.siemens_alignment}, "
            f"and completeness {breakdown.completeness}."
        )
