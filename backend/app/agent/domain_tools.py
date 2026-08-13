"""First-class domain tools for DeepAgents subagents and runtime graph nodes."""

import json
from datetime import datetime, timezone
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
    project_name: str = "Companion",
) -> List[Dict[str, Any]]:
    """Generate structured invention ideas using the DeepAgents research agent.

    Delegates to the ``research-agent`` subagent which reads the knowledge base,
    discovers signals, and produces structured invention ideas. Raises if the
    runtime is unavailable — no silent fallback to template ideas.
    """
    from .runtime import get_deep_agent_runtime

    runtime = get_deep_agent_runtime()

    prompt_parts = [
        "You are the Companion research agent. Your job is to:",
        "1. Read the knowledge-base/ directory to find relevant technical documents",
        "2. Extract signals, patterns, and invention opportunities",
        "3. Produce up to {max_ideas} structured invention ideas",
        "",
        "Each idea must be a JSON object with these keys:",
        "- title: A clear, descriptive title",
        "- problem_statement: The technical problem being solved",
        "- solution_concept: The core inventive concept",
        "- inventive_step: What makes this novel",
        "- business_impact: The business value",
        "- source_evidence: List of source document references",
        "- domain: The strategic domain",
        "- tags: List of relevant keywords",
        "",
    ]
    if user_input.strip():
        prompt_parts.append(f"User direction: {user_input}")
    if topic_name:
        prompt_parts.append(f"Focus topic: {topic_name}")

    prompt_parts.append(
        f"\nReturn a JSON array of exactly {max_ideas} idea objects. "
        "Base your ideas on actual documents from the knowledge base, "
        "not on generic templates."
    )

    input_payload = {
        "messages": [{"role": "user", "content": "\n".join(prompt_parts)}],
        "max_ideas": max_ideas,
    }

    output = runtime.invoke(input_payload)
    ideas = _parse_ideas_from_output(output, max_ideas)
    if not ideas:
        raise RuntimeError(f"Agentic idea generation returned no parseable ideas (runtime output: {type(output).__name__})")
    return ideas


def _parse_ideas_from_output(output: Any, max_ideas: int) -> List[Dict[str, Any]]:
    """Parse structured ideas from the DeepAgents runtime output."""
    if output is None:
        return []

    if isinstance(output, dict):
        messages = output.get("messages", output.get("output", []))
        if isinstance(messages, list):
            for msg in messages:
                if isinstance(msg, dict):
                    content = msg.get("content", "")
                    if isinstance(content, str) and content.strip().startswith("["):
                        try:
                            parsed = json.loads(content)
                            if isinstance(parsed, list):
                                return parsed[:max_ideas]
                        except (json.JSONDecodeError, TypeError):
                            pass

    if isinstance(output, str):
        output = output.strip()
        if output.startswith("["):
            try:
                parsed = json.loads(output)
                if isinstance(parsed, list):
                    return parsed[:max_ideas]
            except (json.JSONDecodeError, TypeError):
                pass

    return []


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
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "provenance": f"artifact:{idea_id}:{section_name}",
            "trust": "generated",
            "evidence_refs": idea_data.get("source_evidence", []),
        }
        save_idea_yaml(idea_id, "idea.yaml", idea_data)
        return True
    except Exception as exc:
        print(f"[Tools] Draft patent section error for {idea_id}: {exc}")
        return False


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
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "provenance": f"approval:{idea_id}:{reviewer_role.lower()}",
        "trust": "trusted",
    }
    idea_data["reviews"] = reviews
    save_idea_yaml(idea_id, "idea.yaml", idea_data)
    return {"idea_id": idea_id, "reviewer": reviewer_role, "decision": decision}


def save_research_note(
    note_id: str,
    title: str,
    content: str,
    source_refs: list[str] | None = None,
) -> Dict[str, Any]:
    """Save a research note to the workspace for later reference by other agents.

    Args:
        note_id: Unique identifier for the note (e.g., 'signal-cluster-1').
        title: Short title describing the note.
        content: Full research note content.
        source_refs: Optional list of source document references.
    """
    notes_dir = Path(WORKSPACE_DIR) / "research-notes"
    notes_dir.mkdir(parents=True, exist_ok=True)
    note = {
        "note_id": note_id,
        "title": title,
        "content": content,
        "source_refs": source_refs or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "provenance": f"research:{note_id}",
    }
    note_path = notes_dir / f"{note_id}.json"
    with open(note_path, "w", encoding="utf-8") as f:
        json.dump(note, f, indent=2)
    print(f"[Research] Saved note: {title} ({note_id})")
    return note
