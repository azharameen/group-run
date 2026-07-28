"""First-class domain tools for DeepAgents subagents and runtime graph nodes."""

import json
from pathlib import Path
from typing import Any, Dict, List

from ..config import KNOWLEDGE_BASE_DIR, WORKSPACE_DIR
from ..storage.yaml_io import load_idea_yaml, save_idea_yaml, write_markdown


def generate_invention_ideas(
    user_input: str = "",
    max_ideas: int = 3,
    topic_name: str = "",
    idea_category: str = "Industrial AI",
    project_name: str = "Siemens Patent Ideator",
) -> List[Dict[str, Any]]:
    """Generate structured invention ideas from user input or Siemens focus domains."""
    ideas: List[Dict[str, Any]] = []
    base_topics = [
        ("AI-Driven Vibration Anomaly Detection in Industrial Edge Devices", "Predictive Edge AI"),
        ("Real-Time Co-Simulation for Digital Twin Cyber-Physical Security", "Digital Twin Systems"),
        ("Decentralized Smart Grid Energy Distribution Optimization", "Smart Infrastructure"),
    ]

    for i in range(min(max_ideas, 3)):
        title, cat = base_topics[i % len(base_topics)]
        if user_input.strip() and i == 0:
            title = f"{user_input.strip()[:60]} System"
        
        ideas.append({
            "title": title,
            "idea_category": idea_category or cat,
            "project_name": project_name,
            "problem_statement": f"Existing state of the art in {cat} lacks real-time physical bounds verification.",
            "solution_concept": f"A novel algorithm integrating physics-informed neural networks directly within Siemens industrial hardware.",
            "inventive_step": "Combines sensor telemetry with deterministic physical constraints at the edge.",
            "business_impact": "Reduces unscheduled plant downtime by up to 40%.",
        })
    return ideas


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

        # Update metadata state
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        idea_data[f"{section_name}_data"] = {
            "summary": content[:200] + "...",
            "path": str(file_path),
            "updated_at": "now",
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
    from ..orchestrator.tools import score_idea
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
        "timestamp": "now",
        "provenance": f"approval:{idea_id}:{reviewer_role.lower()}",
        "trust": "trusted",
    }
    idea_data["reviews"] = reviews
    save_idea_yaml(idea_id, "idea.yaml", idea_data)
    return {"idea_id": idea_id, "reviewer": reviewer_role, "decision": decision}
