"""Structured-output and rendering support for the Product Team."""

import json
from datetime import UTC, datetime
from typing import Any

from ...work_items.product_definition_models import ProductDefinitionSummary


class ProductDefinitionError(RuntimeError):
    """Raised when prerequisites or provider output cannot support a definition."""


async def invoke_product_team(context: str, *, idea_id: str) -> dict[str, Any]:
    """Invoke the configured Product Team and decode its JSON-only response."""
    from ...orchestrator.supervisor import invoke_product_team as invoke

    try:
        result = await invoke(context, idea_id=idea_id)
        content: Any = result
        if isinstance(result, dict):
            content = result.get("output", result.get("messages", result))
        if isinstance(content, list) and content:
            last = content[-1]
            content = (
                last.get("content", last)
                if isinstance(last, dict)
                else getattr(last, "content", last)
            )
        if not isinstance(content, (str, dict)):
            content = getattr(content, "content", content)
        if isinstance(content, str):
            content = json.loads(content)
        if not isinstance(content, dict):
            raise ProductDefinitionError("Product Team returned no structured output")
        return content
    except ProductDefinitionError:
        raise
    except Exception as exc:
        raise ProductDefinitionError(f"Product Team provider failed: {exc}") from exc


def normalize_definition(
    output: dict[str, Any] | str,
    *,
    agent_id: str,
) -> ProductDefinitionSummary:
    """Validate provider output while enforcing runtime-owned attribution."""
    if isinstance(output, str):
        try:
            output = json.loads(output)
        except json.JSONDecodeError as exc:
            raise ProductDefinitionError("Product Team returned invalid JSON") from exc
    if not isinstance(output, dict):
        raise ProductDefinitionError("Product Team returned a non-object definition")
    wrapped = output.get("product_definition", output.get("definition", output))
    if not isinstance(wrapped, dict):
        raise ProductDefinitionError("Product Team returned a non-object definition")
    data = dict(wrapped)
    data.pop("timestamp", None)
    data["agent_id"] = agent_id
    data["generated_at"] = datetime.now(UTC).isoformat()
    data["trust"] = "generated"
    data["artifact_name"] = "product-definition"
    data.pop("artifact_version", None)
    roadmap = data.get("roadmap")
    if isinstance(roadmap, list):
        data["roadmap"] = [
            {**phase, "estimate_trust": "generated"} if isinstance(phase, dict) else phase
            for phase in roadmap
        ]
    try:
        return ProductDefinitionSummary.model_validate(data)
    except Exception as exc:
        raise ProductDefinitionError(f"Invalid product definition: {exc}") from exc


def definition_evidence(summary: ProductDefinitionSummary) -> set[str]:
    """Collect all evidence cited anywhere in the structured definition."""
    refs = set(summary.evidence_refs)
    for requirement in summary.requirements:
        refs.update(requirement.evidence_refs)
    for story in summary.user_stories:
        refs.update(story.evidence_refs)
    for phase in summary.roadmap:
        refs.update(phase.estimate_basis.evidence_refs)
    for metric in summary.success_metrics:
        refs.update(metric.evidence_refs)
    return refs


def definition_markdown(summary: ProductDefinitionSummary) -> str:
    """Render the single canonical product-definition artifact."""
    requirements = "\n".join(
        f"### {item.requirement_id}: {item.title}\n\n"
        f"{item.description}\n\nPriority: **{item.priority}**  \n"
        f"Evidence: {', '.join(item.evidence_refs)}"
        for item in summary.requirements
    )
    stories = "\n".join(
        f"### {item.story_id}\n\nAs a **{item.persona}**, I need {item.need}, "
        f"so that {item.benefit}.\n\n"
        + "\n".join(f"- {criterion}" for criterion in item.acceptance_criteria)
        + f"\n\nEvidence: {', '.join(item.evidence_refs)}"
        for item in summary.user_stories
    )
    roadmap = "\n".join(
        f"### {phase.phase}\n\n{phase.objective}\n\n"
        f"- Deliverables: {', '.join(phase.deliverables)}\n"
        f"- Agent-hours: {phase.agent_hours}\n"
        f"- Projected compute cost: {phase.projected_compute_cost}\n"
        f"- Estimate trust: **{phase.estimate_trust}**\n"
        f"- Basis: {phase.estimate_basis.method}\n"
        f"- Assumptions: {', '.join(phase.estimate_basis.assumptions)}\n"
        f"- Evidence: {', '.join(phase.estimate_basis.evidence_refs)}"
        for phase in summary.roadmap
    )
    metrics = "\n".join(
        f"- **{metric.name}:** {metric.target} — {metric.measurement} "
        f"(evidence: {', '.join(metric.evidence_refs)})"
        for metric in summary.success_metrics
    )
    return (
        "# Product Definition\n\n"
        "> Generated planning artifact. Chief of Staff approval is required before handoff.\n\n"
        f"- **Confidence:** {summary.confidence}/10\n"
        f"- **Agent:** {summary.agent_id}\n"
        f"- **Generated at:** {summary.generated_at}\n"
        f"- **Trust:** {summary.trust}\n"
        f"- **Provenance:** {summary.provenance}\n\n"
        f"## Product requirements\n\n{requirements}\n\n"
        f"## User stories\n\n{stories}\n\n"
        f"## Phased roadmap and estimates\n\n{roadmap}\n\n"
        f"## Success metrics\n\n{metrics}\n\n"
        f"## Reasoning\n\n{summary.reasoning}\n\n"
        "## Alternatives considered\n\n"
        + "\n".join(f"- {alternative}" for alternative in summary.alternatives)
        + "\n"
    )
