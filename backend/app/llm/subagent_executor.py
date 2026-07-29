"""DeepAgents integrated workflow executor shim."""

from typing import Dict, Any

from ..llm.client import call_llm_json
from ..llm.execution_support import load_autonomous_context, render_context_summary, stringify_content
from ..storage.yaml_io import load_idea_yaml
from ..agent.runner import execute_deep_agent_workflow
from ..agent.domain_tools import generate_invention_ideas


def execute_autonomous_idea_generation(max_ideas: int = 3) -> list[dict[str, Any]]:
    """Generate autonomous invention ideas via DeepAgents domain tools."""
    return generate_invention_ideas(max_ideas=max_ideas)


def execute_seed_ideas_from_input(
    user_input: str,
    topic_name: str = "",
    idea_category: str = "",
    project_name: str = "",
) -> list[dict[str, Any]]:
    """Generate seeded invention ideas from user input via DeepAgents domain tools."""
    return generate_invention_ideas(
        user_input=user_input,
        max_ideas=3,
        topic_name=topic_name,
        idea_category=idea_category or "Industrial AI",
        project_name=project_name or "Siemens Patent Ideator",
    )


def _build_scoring_prompt(idea_id: str, criterion: str | None = None) -> tuple[str, str]:
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
    if criterion:
        user_prompt = (
            "Score this single criterion for the idea below.\n\n"
            f"Criterion: {criterion}\n\n"
            f"Idea:\n{stringify_content(idea_snapshot)}\n\n"
            f"Supporting context:\n{render_context_summary(context, max_documents=8)}\n\n"
            "Return JSON with keys: criterion, score, reasoning, confidence."
        )
    else:
        user_prompt = (
            "Score the idea across all seven criteria below.\n\n"
            f"Idea:\n{stringify_content(idea_snapshot)}\n\n"
            f"Supporting context:\n{render_context_summary(context, max_documents=8)}\n\n"
            "Return JSON with keys: summary and criteria. The criteria object must contain "
            "novelty, siemens_alignment, technical_feasibility, detectability, business_value, originality, "
            "and completeness. Each criterion must include score, reasoning, and confidence."
        )
    return system_prompt, user_prompt


def execute_llm_scoring(idea_id: str, criterion: str | None = None) -> Dict[str, Any]:
    """Execute criteria scoring via the configured LLM."""
    system_prompt, user_prompt = _build_scoring_prompt(idea_id, criterion)
    result = call_llm_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.1,
        max_tokens=1800,
    )
    if not isinstance(result, dict):
        raise ValueError("Scoring model must return a JSON object.")
    if criterion:
        return result
    return result


def run_subagent(state_name: str, idea_id: str, **kwargs) -> Dict[str, Any]:
    """Route state execution directly to the DeepAgents runner engine."""
    return execute_deep_agent_workflow(idea_id, state_name, f"execute_{state_name}")
