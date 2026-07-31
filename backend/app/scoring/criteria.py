"""Criterion evaluators for the 7 scoring dimensions."""

from ..models.idea import CriterionDetail, ScoreBreakdown
from ..storage.yaml_io import load_idea_yaml
from ..llm.client import call_llm_json
from ..llm.execution_support import load_autonomous_context, render_context_summary, stringify_content
from ..infrastructure.events.stream_bus import emit_sse


def _build_scoring_prompt(idea_id: str) -> tuple[str, str]:
    idea = load_idea_yaml(idea_id, "idea.yaml") or {}
    context = load_autonomous_context()
    system_prompt = (
        "You are a senior Siemens patent analyst. Score invention ideas only from the provided evidence. "
        "Return concise JSON with numeric scores from 0 to 100 and grounded reasoning."
    )
    idea_snapshot = {
        "idea_id": idea_id,
        "title": idea.get("title", ""),
        "problem_statement": idea.get("problem_statement", ""),
        "solution_concept": idea.get("solution_concept", ""),
        "siemens_domain": idea.get("siemens_domain", ""),
        "tags": idea.get("tags", []),
        "source_evidence": idea.get("source_evidence", []),
        "artifact_revisions": idea.get("artifact_revisions", {}),
        "workflow_state": idea.get("workflow_state", ""),
    }
    user_prompt = (
        "Score the idea across all seven criteria below.\n\n"
        f"Idea:\n{stringify_content(idea_snapshot)}\n\n"
        f"Supporting context:\n{render_context_summary(context, max_documents=8)}\n\n"
        "Return JSON with keys: summary and criteria. The criteria object must contain "
        "novelty, siemens_alignment, technical_feasibility, detectability, business_value, originality, "
        "and completeness. Each criterion must include score, reasoning, and confidence."
    )
    return system_prompt, user_prompt


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
        system_prompt, user_prompt = _build_scoring_prompt(self.idea_id)
        result = call_llm_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=1800,
        )
        if not isinstance(result, dict):
            raise ValueError("Scoring model must return a JSON object.")

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

        # Emit scoring reasoning as SSE event so connected UI clients see it
        reasoning_lines = []
        for name, detail in detail_map.items():
            reasoning_lines.append(f"{name.replace('_', ' ').title()}: {detail.score}/100 — {detail.reasoning}")
        try:
            emit_sse("agent.progress", {
                "idea_id": self.idea_id,
                "agent": "scoring-engine",
                "message": f"Scored {self.idea_id}: {summary[:120]}",
                "state": "scored",
                "details": "\n".join(reasoning_lines),
            })
        except Exception:
            pass

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
