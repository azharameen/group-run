"""Workflow and system status query helpers."""

from ...config import settings
from ...orchestrator.workflow import get_active_idea
from ...storage.yaml_io import load_idea_registry, load_idea_yaml


def build_workflow_status() -> dict:
    """Return the active idea and queued ideas for dashboard consumption."""
    registry = load_idea_registry()
    ideas = registry.get("ideas", [])
    active_idea_id = get_active_idea()
    active_idea = None
    queued = []

    for entry in ideas:
        idea_id = entry.get("idea_id")
        if not idea_id:
            continue

        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        scores = load_idea_yaml(idea_id, "scores.yaml") or {}
        latest = scores.get("latest", {})
        state = idea_data.get("current_state", entry.get("state", "raw_signal_collected"))
        payload = {
            "idea_id": idea_id,
            "title": idea_data.get("title", entry.get("title", "")),
            "state": state,
            "phase": idea_data.get("phase", entry.get("phase", "discovery")),
            "active_processing": idea_data.get("active_processing", False),
            "paused_processing": idea_data.get("paused_processing", False),
            "active_agent": idea_data.get("active_agent", ""),
            "active_state": idea_data.get("active_state", ""),
            "active_message": idea_data.get("active_message", ""),
            "running_agent": idea_data.get("running_agent", ""),
            "composite_score": latest.get("composite", 0),
            "created_at": idea_data.get("created_at", entry.get("created_at", "")),
        }
        if idea_id == active_idea_id:
            active_idea = payload
        else:
            queued.append(payload)

    return {
        "active_idea_id": active_idea_id,
        "active_idea": active_idea,
        "queued_count": len(queued),
        "queued_ideas": queued,
        "one_idea_focus": True,
    }


def build_stats() -> dict:
    """Return aggregate system statistics."""
    registry = load_idea_registry()
    ideas_list = registry.get("ideas", [])

    by_phase: dict[str, int] = {}
    by_state: dict[str, int] = {}
    total_score = 0.0
    scored_count = 0
    above_threshold = 0

    for entry in ideas_list:
        idea_id = entry["idea_id"]
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        scores = load_idea_yaml(idea_id, "scores.yaml") or {}

        phase = idea_data.get("phase", "unknown")
        state = idea_data.get("current_state", "unknown")
        by_phase[phase] = by_phase.get(phase, 0) + 1
        by_state[state] = by_state.get(state, 0) + 1

        latest = scores.get("latest", {})
        composite = latest.get("composite", 0)
        if composite:
            total_score += composite
            scored_count += 1
            if composite >= settings.composite_threshold:
                above_threshold += 1

    average_score = round(total_score / scored_count, 1) if scored_count else 0.0
    ideas_at_threshold = 0
    for entry in ideas_list:
        score_record = load_idea_yaml(entry["idea_id"], "scores.yaml") or {}
        latest = score_record.get("latest", {}) if isinstance(score_record, dict) else {}
        if latest.get("composite", 0) >= settings.composite_threshold:
            ideas_at_threshold += 1

    return {
        "total_ideas": len(ideas_list),
        "by_phase": by_phase,
        "by_state": by_state,
        "average_score": average_score,
        "ideas_above_threshold": above_threshold,
        "ideas_at_threshold": ideas_at_threshold,
    }
