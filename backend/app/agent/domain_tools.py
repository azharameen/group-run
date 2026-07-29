"""First-class domain tools for DeepAgents subagents and runtime graph nodes."""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from ..config import KNOWLEDGE_BASE_DIR, WORKSPACE_DIR
from ..storage.yaml_io import load_idea_yaml, save_idea_yaml, write_markdown
from ..storage.artifacts import save_artifact_revision


def generate_invention_ideas(
    user_input: str = "",
    max_ideas: int = 3,
    topic_name: str = "",
    idea_category: str = "Industrial AI",
    project_name: str = "Siemens Patent Ideator",
) -> List[Dict[str, Any]]:
    """Generate structured invention ideas from user input or Siemens focus domains."""
    ideas: List[Dict[str, Any]] = []
    taxonomy = query_prior_art_taxonomy("IND_AI")
    taxonomy_name = str(taxonomy.get("name") or idea_category or "Industrial AI")
    taxonomy_keywords = [str(item).strip() for item in taxonomy.get("keywords", []) if str(item).strip()]
    topic_terms = [term for term in re.split(r"[^a-zA-Z0-9]+", topic_name.strip()) if len(term) > 3]
    user_terms = [
        term
        for term in re.split(r"[^a-zA-Z0-9]+", user_input.strip())
        if len(term) > 3
    ]
    signal_terms = user_terms or topic_terms or taxonomy_keywords or [taxonomy_name]

    if user_input.strip():
        prior_art = search_prior_art(user_input, limit=max_ideas)
    else:
        prior_art = search_prior_art(" ".join(signal_terms), limit=max_ideas)

    for index in range(max_ideas):
        focus_term = signal_terms[index % len(signal_terms)]
        secondary_term = signal_terms[(index + 1) % len(signal_terms)]
        title_prefix = focus_term.replace("_", " ").strip().title()
        if user_input.strip() and index == 0:
            title_prefix = " ".join(user_input.strip().split()[:8]).strip().title() or title_prefix

        evidence: list[str] = []
        if index < len(prior_art):
            source = prior_art[index]
            evidence.extend(
                item for item in [source.title, source.snippet, source.provenance] if item
            )
        else:
            evidence.extend(taxonomy_keywords[:2])

        ideas.append(
            {
                "title": f"{title_prefix} {taxonomy_name} Concept {index + 1}",
                "idea_category": idea_category or taxonomy_name,
                "project_name": project_name,
                "problem_statement": (
                    f"Existing approaches in {taxonomy_name} do not fully address {focus_term.lower()} "
                    f"when the workflow must also account for {secondary_term.lower()}."
                ),
                "solution_concept": (
                    f"Use {focus_term.lower()} as the primary signal, combine it with {secondary_term.lower()}, "
                    f"and align the system with the documented taxonomy for {taxonomy_name.lower()}."
                ),
                "inventive_step": (
                    f"Derive a decision pipeline from {', '.join(taxonomy_keywords[:3]) or taxonomy_name} "
                    f"and adapt it to {focus_term.lower()} operations."
                ),
                "business_impact": (
                    f"Improves {taxonomy_name.lower()} outcomes by reducing manual analysis of {focus_term.lower()} "
                    f"and making {secondary_term.lower()} workstreams easier to review."
                ),
                "source_evidence": evidence,
                "siemens_domain": taxonomy_name,
                "tags": [focus_term.lower(), secondary_term.lower(), taxonomy_name.lower()],
            }
        )

    return ideas[:max_ideas]


def query_prior_art_taxonomy(category_code: str = "IND_AI") -> Dict[str, Any]:
    """Query knowledge base prior-art taxonomy definitions and keywords."""
    taxonomy_file = Path(KNOWLEDGE_BASE_DIR) / "prior_art_taxonomy.json"
    if taxonomy_file.exists():
        try:
            data = json.loads(taxonomy_file.read_text(encoding="utf-8"))
            for cat in data.get("categories", []):
                if cat.get("code") == category_code:
                    return cat
            return data.get("categories", [{}])[0]
        except Exception as exc:
            print(f"[Tools] Taxonomy load error: {exc}")
    return {
        "code": "IND_AI",
        "name": "Industrial Artificial Intelligence",
        "keywords": ["neural networks", "predictive maintenance", "anomaly detection"],
    }


def draft_patent_section(
    idea_id: str,
    section_name: str,
    content: str,
) -> bool:
    """Draft or update a formal patent disclosure section inside the idea workspace folder."""
    try:
        idea_folder = Path(WORKSPACE_DIR) / "ideas" / idea_id
        idea_folder.mkdir(parents=True, exist_ok=True)
        file_path = idea_folder / f"{section_name}.md"
        write_markdown(str(file_path), content)
        save_artifact_revision(
            idea_id,
            section_name,
            content,
            provenance=f"artifact:{idea_id}:{section_name}",
            trust="generated",
            evidence_refs=(load_idea_yaml(idea_id, "idea.yaml") or {}).get("source_evidence", []),
        )

        # Update metadata state
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        idea_data[f"{section_name}_data"] = {
            "summary": content[:200] + "...",
            "path": str(file_path),
            "updated_at": datetime.utcnow().isoformat(),
            "provenance": f"artifact:{idea_id}:{section_name}",
            "trust": "generated",
            "evidence_refs": idea_data.get("source_evidence", []),
        }
        save_idea_yaml(idea_id, "idea.yaml", idea_data)
        return True
    except Exception as exc:
        print(f"[Tools] Draft patent section error for {idea_id}: {exc}")
        return False


def evaluate_patentability(idea_id: str) -> Dict[str, Any]:
    """Run scoring engine for an idea to calculate criteria scores and composite rating."""
    from ..orchestrator.workflow_tools import score_idea
    return score_idea(idea_id)


def record_approval_decision(
    idea_id: str,
    reviewer_role: str,
    decision: str,
    comments: str = "",
) -> Dict[str, Any]:
    """Record a human reviewer or AI counsel approval/rejection decision."""
    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
    reviews = idea_data.get("reviews", {})
    reviews[reviewer_role.lower()] = {
        "status": decision,
        "comments": comments,
        "timestamp": datetime.utcnow().isoformat(),
        "provenance": f"approval:{idea_id}:{reviewer_role.lower()}",
        "trust": "trusted",
    }
    idea_data["reviews"] = reviews
    save_idea_yaml(idea_id, "idea.yaml", idea_data)
    return {"idea_id": idea_id, "reviewer": reviewer_role, "decision": decision}
