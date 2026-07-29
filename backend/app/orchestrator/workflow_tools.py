"""Custom tools used by DeepAgents subagents and the orchestrator."""

from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

from ..config import WORKSPACE_DIR, settings
from ..models.idea import (
    IdeaRecord,
    WorkflowState,
    phase_for_state,
)
from ..state.machine import PatentWorkflowMachine, create_workflow_machine
from ..scoring.engine import ScoringEngine
from ..storage.yaml_io import (
    load_idea_registry,
    save_idea_registry,
    create_idea_folder,
    save_idea_yaml,
    load_idea_yaml,
    delete_idea_folder,
    archive_idea_folder,
)
from ..storage.artifacts import save_artifact_revision, build_artifact_comparison
from ..research.adapters import search_prior_art, search_filing_sources

# Active workflow machines, keyed by idea_id
_machines: dict[str, PatentWorkflowMachine] = {}


# ── Forward declaration of SSE emit (set at runtime by main.py) ──
_emit_sse_callback = None


def set_emit_sse_callback(cb):
    global _emit_sse_callback
    _emit_sse_callback = cb


def _emit(event_type: str, data: dict):
    if _emit_sse_callback:
        _emit_sse_callback(event_type, data)


def get_machine(idea_id: str) -> PatentWorkflowMachine:
    """Get or create a workflow machine for an idea."""
    if idea_id not in _machines:
        _machines[idea_id] = create_workflow_machine(idea_id)
    return _machines[idea_id]


def remove_idea_machine(idea_id: str) -> None:
    """Remove a cached workflow machine for an idea."""
    _machines.pop(idea_id, None)


def _normalize_text(value: str) -> str:
    return " ".join(str(value or "").lower().split())


def detect_duplicate_ideas(
    signal_text: str,
    title: str = "",
    threshold: float = 0.72,
) -> dict:
    registry = load_idea_registry()
    candidates: list[dict] = []
    query = _normalize_text(" ".join([title, signal_text]))
    idea_entries = list(registry.get("ideas", []))
    ideas_root = Path(WORKSPACE_DIR) / "ideas"
    if ideas_root.exists():
        for folder in ideas_root.iterdir():
            if folder.is_dir() and (folder / "idea.yaml").exists():
                idea_entries.append({"idea_id": folder.name, "title": folder.name})

    seen_ids: set[str] = set()
    for idea in idea_entries:
        idea_id = idea.get("idea_id")
        if not idea_id or idea_id in seen_ids:
            continue
        seen_ids.add(idea_id)
        data = load_idea_yaml(idea_id, "idea.yaml") or {}
        corpus = _normalize_text(
            " ".join(
                str(part or "")
                for part in [
                    data.get("title", ""),
                    data.get("signal_text", ""),
                    data.get("problem_statement", ""),
                    data.get("solution_concept", ""),
                ]
            )
        )
        if not corpus:
            continue
        title_score = SequenceMatcher(None, _normalize_text(title), _normalize_text(str(data.get("title", idea.get("title", ""))))).ratio()
        query_tokens = set(query.split())
        corpus_tokens = set(corpus.split())
        token_score = 0.0
        if query_tokens and corpus_tokens:
            token_score = len(query_tokens & corpus_tokens) / max(min(len(query_tokens), len(corpus_tokens)), 1)
        score = max(title_score, SequenceMatcher(None, query, corpus).ratio(), token_score)
        if score >= threshold:
            candidates.append(
                {
                    "idea_id": idea_id,
                    "title": data.get("title", idea.get("title", "")),
                    "state": data.get("current_state", idea.get("state", "")),
                    "score": round(score, 3),
                    "provenance": f"duplicate:{idea_id}",
                }
            )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return {
        "query": query,
        "threshold": threshold,
        "matches": candidates,
        "is_duplicate": bool(candidates),
    }


def build_review_packet(idea_id: str, reviewer_role: str = "reviewer") -> dict:
    idea = load_idea_yaml(idea_id, "idea.yaml") or {}
    scores = load_idea_yaml(idea_id, "scores.yaml") or {}
    transcript = load_idea_yaml(idea_id, "transcript.yaml") or []
    packet = {
        "idea_id": idea_id,
        "reviewer_role": reviewer_role,
        "title": idea.get("title", ""),
        "state": idea.get("current_state", ""),
        "phase": idea.get("phase", ""),
        "summary": idea.get("problem_statement", "")[:240],
        "scores": scores.get("latest", {}),
        "source_evidence": idea.get("source_evidence", []),
        "transcript_highlights": [
            evt for evt in transcript if evt.get("type") in {"thinking", "tool_call", "tool_result", "handover", "approval", "interrupt"}
        ][-8:],
        "artifact_revisions": idea.get("artifact_revisions", {}),
        "provenance": f"review-packet:{idea_id}:{reviewer_role}",
    }
    packet_text = (
        f"# Review Packet: {packet['title']}\n\n"
        f"- Idea ID: {idea_id}\n"
        f"- Reviewer Role: {reviewer_role}\n"
        f"- State: {packet['state']}\n"
        f"- Phase: {packet['phase']}\n\n"
        f"## Summary\n{packet['summary']}\n\n"
        f"## Scores\n{packet['scores']}\n\n"
        f"## Evidence\n" + "\n".join(f"- {item}" for item in packet["source_evidence"]) + "\n"
    )
    save_artifact_revision(
        idea_id,
        f"review-packet-{reviewer_role.replace(' ', '-').lower()}",
        packet_text,
        provenance=packet["provenance"],
        trust="trusted",
        evidence_refs=packet["source_evidence"],
    )
    packet["rendered"] = packet_text
    return packet


def get_prior_art_sources(query: str, limit: int = 5) -> dict:
    results = search_prior_art(query, limit=limit)
    return {
        "query": query,
        "count": len(results),
        "sources": [result.__dict__ for result in results],
    }


def get_filing_sources(query: str, limit: int = 5) -> dict:
    results = search_filing_sources(query, limit=limit)
    return {
        "query": query,
        "count": len(results),
        "sources": [result.__dict__ for result in results],
    }


# ═══════════════════════════════════════════════════════════
# Tool 1: create_idea_folder
# ═══════════════════════════════════════════════════════════
def create_idea(signal_text: str, title: str = "") -> str:
    """Create a new idea from a raw signal. Returns the new idea_id."""
    registry = load_idea_registry()
    idea_id_num = registry["next_id"]
    idea_id = f"IDEA-{idea_id_num:04d}"

    # Create folder
    create_idea_folder(idea_id)

    # Create idea.yaml
    record = IdeaRecord(
        idea_id=idea_id,
        title=title or f"Idea #{idea_id_num}",
        current_state=WorkflowState.raw_signal_collected,
        phase="discovery",
        signal_text=signal_text,
        running_agent="knowledge-curator",
    )
    save_idea_yaml(idea_id, "idea.yaml", record.model_dump(mode="json"))

    # Initialize state.yaml
    state_data = {
        "idea_id": idea_id,
        "current_state": WorkflowState.raw_signal_collected.value,
        "phase": "discovery",
        "created_at": datetime.utcnow().isoformat(),
        "history": [],
    }
    save_idea_yaml(idea_id, "state.yaml", state_data)

    # Initialize scores.yaml
    scores_data = {"idea_id": idea_id, "history": []}
    save_idea_yaml(idea_id, "scores.yaml", scores_data)

    # Register
    registry["ideas"].append({
        "idea_id": idea_id,
        "title": record.title,
        "state": WorkflowState.raw_signal_collected.value,
        "phase": "discovery",
        "created_at": datetime.utcnow().isoformat(),
    })
    registry["next_id"] = idea_id_num + 1
    save_idea_registry(registry)

    # Create machine
    _machines[idea_id] = create_workflow_machine(idea_id)

    _emit("idea.created", {
        "idea_id": idea_id,
        "title": record.title,
        "phase": "discovery",
        "state": WorkflowState.raw_signal_collected.value,
    })

    return idea_id


# ═══════════════════════════════════════════════════════════
# Tool 2: advance_workflow
# ═══════════════════════════════════════════════════════════
def advance_workflow(idea_id: str, target_state: str) -> dict:
    """Advance an idea through the workflow. Validates gate, transitions state.
    
    Returns a dict with success, new_state, and any validation errors.
    """
    machine = get_machine(idea_id)
    current = machine.state

    data = load_idea_yaml(idea_id, "idea.yaml") or {}
    if data.get("paused_processing", False):
        return {
            "success": False,
            "error": "Idea is paused",
            "current_state": current,
        }

    # Find the registered trigger that leads to target_state
    trigger_name = None
    for trig_name, event in machine.machine.events.items():
        for source_state, trans_list in event.transitions.items():
            src = str(source_state) if hasattr(source_state, 'value') else source_state
            if src == current:
                for t in trans_list:
                    if t.dest == target_state:
                        trigger_name = trig_name
                        break
            if trigger_name:
                break
        if trigger_name:
            break

    if not trigger_name:
        return {
            "success": False,
            "error": f"No transition from {current} to {target_state}",
            "current_state": current,
        }

    # Attempt the transition (validate() runs as guard via conditions)
    try:
        getattr(machine, trigger_name)()
        return {
            "success": True,
            "previous_state": current,
            "new_state": machine.state,
            "validation": machine.last_validation_result,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "current_state": machine.state,
            "validation": machine.last_validation_result,
        }


# ═══════════════════════════════════════════════════════════
# Tool 3: score_idea
# ═══════════════════════════════════════════════════════════
def score_idea(idea_id: str, agent_name: str = "scoring-engine") -> dict:
    """Run the 7-criterion scoring engine on an idea. Returns score record."""
    engine = ScoringEngine(idea_id)
    record = engine.score(agent_name)
    meets, reason = engine.meets_threshold()

    criteria_detail = {
        k: v.model_dump() for k, v in record.criteria_detail.items()
    }

    _emit("idea.scored", {
        "idea_id": idea_id,
        "composite": record.composite,
        "breakdown": record.breakdown.model_dump(),
        "strength_rating": record.strength_rating,
    })

    return {
        "composite": record.composite,
        "breakdown": record.breakdown.model_dump(),
        "criteria_detail": criteria_detail,
        "summary": record.summary,
        "change_explanation": record.change_explanation,
        "strength_rating": record.strength_rating,
        "meets_threshold": meets,
        "threshold_reason": reason,
    }


# ═══════════════════════════════════════════════════════════
# Tool 4: validate_gate
# ═══════════════════════════════════════════════════════════
def validate_gate(idea_id: str, gate_name: str) -> dict:
    """Run a specific gate checklist and return pass/fail with details."""
    machine = get_machine(idea_id)
    return machine.validate_gate(idea_id, gate_name)


# ═══════════════════════════════════════════════════════════
# Tool 5: write_handover
# ═══════════════════════════════════════════════════════════
def write_handover(
    idea_id: str, from_state: str, to_state: str,
    summary: str = "", findings: Optional[list[str]] = None,
    recommendations: Optional[list[str]] = None,
) -> str:
    """Write a structured handover packet for the next subagent."""
    from ..storage.yaml_io import write_handover as _write_handover

    findings = findings or []
    recommendations = recommendations or []

    content = (
        f"## Handover: {from_state} → {to_state}\n\n"
        f"**From:** subagent\n"
        f"**To:** subagent\n"
        f"**Timestamp:** {datetime.utcnow().isoformat()}\n\n"
        f"### Summary\n{summary}\n\n"
        f"### Key Findings\n"
        + "\n".join(f"- {f}" for f in findings) + "\n\n"
        f"### Recommendations\n"
        + "\n".join(f"- {r}" for r in recommendations) + "\n"
    )

    _write_handover(idea_id, from_state, to_state, content)
    return content


# ═══════════════════════════════════════════════════════════
# Tool 6: update_idea_field
# ═══════════════════════════════════════════════════════════
def update_idea_field(idea_id: str, field: str, value) -> dict:
    """Update a field in the idea's idea.yaml."""
    data = load_idea_yaml(idea_id, "idea.yaml") or {}
    data[field] = value
    data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", data)

    # Also update registry
    registry = load_idea_registry()
    for idea in registry["ideas"]:
        if idea["idea_id"] == idea_id:
            idea[field] = value
            break
    if field == "title":
        for idea in registry["ideas"]:
            if idea["idea_id"] == idea_id:
                idea["title"] = value
                break
    save_idea_registry(registry)

    _emit("agent.progress", {
        "idea_id": idea_id,
        "message": f"Updated field '{field}'",
    })

    return {"idea_id": idea_id, "field": field, "value": value}


def set_idea_paused(idea_id: str, paused: bool) -> dict:
    """Mark an idea as paused or resumed."""
    data = load_idea_yaml(idea_id, "idea.yaml") or {}
    data["paused_processing"] = paused
    data["active_processing"] = False if paused else data.get("active_processing", False)
    data["active_agent"] = "" if paused else data.get("active_agent", "")
    data["active_state"] = "" if paused else data.get("active_state", "")
    data["active_message"] = "Paused by user" if paused else ""
    data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", data)

    registry = load_idea_registry()
    for idea in registry["ideas"]:
        if idea["idea_id"] == idea_id:
            idea["paused_processing"] = paused
            break
    save_idea_registry(registry)

    _emit("idea.paused" if paused else "idea.resumed", {"idea_id": idea_id})
    return {"idea_id": idea_id, "paused_processing": paused}


def delete_idea(idea_id: str) -> dict:
    """Delete an idea from the registry, cache, and filesystem."""
    remove_idea_machine(idea_id)
    removed_folder = delete_idea_folder(idea_id)
    registry = load_idea_registry()
    before = len(registry.get("ideas", []))
    registry["ideas"] = [idea for idea in registry.get("ideas", []) if idea.get("idea_id") != idea_id]
    removed_registry = len(registry["ideas"]) < before
    if removed_registry:
        save_idea_registry(registry)
    _emit("idea.deleted", {"idea_id": idea_id})
    return {"idea_id": idea_id, "deleted": removed_folder or removed_registry}


def archive_idea(idea_id: str) -> dict:
    """Archive an idea snapshot while keeping its active workspace metadata intact."""
    remove_idea_machine(idea_id)
    archive_path = archive_idea_folder(idea_id)
    if not archive_path:
        return {"idea_id": idea_id, "archived": False}

    data = load_idea_yaml(idea_id, "idea.yaml") or {}
    data["archived"] = True
    data["archived_at"] = datetime.utcnow().isoformat()
    data["paused_processing"] = True
    data["active_processing"] = False
    data["active_agent"] = ""
    data["active_state"] = ""
    data["active_message"] = "Archived"
    save_idea_yaml(idea_id, "idea.yaml", data)

    registry = load_idea_registry()
    for idea in registry.get("ideas", []):
        if idea.get("idea_id") == idea_id:
            idea["archived"] = True
            idea["paused_processing"] = True
            idea["updated_at"] = data["archived_at"]
            break
    save_idea_registry(registry)

    _emit("idea.archived", {"idea_id": idea_id, "archive_path": archive_path})
    return {"idea_id": idea_id, "archived": True, "archive_path": archive_path}


# ═══════════════════════════════════════════════════════════
# Tool 7: add_evidence
# ═══════════════════════════════════════════════════════════
def add_evidence(idea_id: str, source: str, content: str) -> dict:
    """Add a source evidence entry to an idea."""
    data = load_idea_yaml(idea_id, "idea.yaml") or {}
    evidence = data.get("source_evidence", [])
    evidence.append(f"{source}: {content[:200]}")
    data["source_evidence"] = evidence
    data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", data)

    _emit("agent.progress", {
        "idea_id": idea_id,
        "message": f"Added evidence from {source}",
    })

    return {"idea_id": idea_id, "evidence_count": len(evidence)}


# ═══════════════════════════════════════════════════════════
# Tool 8: advance_to_next_state (auto-advance one step)
# ═══════════════════════════════════════════════════════════
def advance_to_next_state(idea_id: str) -> dict:
    """Automatically advance the idea to the next workflow state.
    
    Scans available transitions and attempts the first valid one.
    """
    machine = get_machine(idea_id)
    current = machine.state

    # Get all destinations available from current state
    for trig_name, event in machine.machine.events.items():
        for source_state, trans_list in event.transitions.items():
            src = str(source_state) if hasattr(source_state, 'value') else source_state
            if src == current:
                for t in trans_list:
                    if t.dest != current:
                        return advance_workflow(idea_id, t.dest)

    return {
        "success": False,
        "error": "No further transitions available",
        "current_state": current,
    }


def get_all_machines() -> dict[str, PatentWorkflowMachine]:
    return _machines
