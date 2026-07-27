"""Workflow orchestration: autonomous idea generation and improvement cycle.

Provides both the single-cycle advancement AND the full end-to-end pipeline
that runs all 18 states from signal input to ready_for_submission.
"""

import os
from datetime import datetime

import yaml

from ..config import CONFIG_DIR
from ..storage.yaml_io import load_idea_registry, load_idea_yaml, save_idea_yaml
from .tools import (
    get_machine,
    create_idea,
    advance_workflow,
    score_idea,
    update_idea_field,
    add_evidence,
)
from ..llm.subagent_executor import execute_autonomous_idea_generation


_cycle_running = False
_emit_sse_callback = None
_active_idea_id: str = ""  # Single idea currently being processed
_paused_idea_ids: set[str] = set()


def set_emit_sse_callback(cb):
    global _emit_sse_callback
    _emit_sse_callback = cb


def _emit(event_type: str, data: dict):
    if _emit_sse_callback:
        _emit_sse_callback(event_type, data)


def is_cycle_running() -> bool:
    return _cycle_running


def get_active_idea() -> str:
    """Return the idea ID currently being processed by an agent."""
    return _active_idea_id


def pause_idea(idea_id: str) -> None:
    _paused_idea_ids.add(idea_id)


def resume_idea(idea_id: str) -> None:
    _paused_idea_ids.discard(idea_id)


def is_idea_paused(idea_id: str) -> bool:
    if idea_id in _paused_idea_ids:
        return True
    data = load_idea_yaml(idea_id, "idea.yaml") or {}
    return bool(data.get("paused_processing", False))


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _load_terminal_states() -> set[str]:
    """Load terminal workflow states from config, with a safe fallback."""
    default_states = {"submitted", "accepted_or_closed"}
    config_path = os.path.join(CONFIG_DIR, "system-config.yaml")
    if not os.path.exists(config_path):
        return default_states

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
    except Exception:
        return default_states

    workflow_cfg = config.get("workflow", {}) if isinstance(config, dict) else {}
    terminal_states = workflow_cfg.get("terminal_states") if isinstance(workflow_cfg, dict) else None
    if isinstance(terminal_states, list) and terminal_states:
        return {str(state) for state in terminal_states if str(state).strip()}
    return default_states


def _set_active_processing(idea_id: str, active: bool, *, agent: str = "", state: str = "", message: str = ""):
    """Persist a lightweight active-processing marker for UI/status endpoints."""
    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
    idea_data["active_processing"] = active
    idea_data["active_agent"] = agent
    idea_data["active_state"] = state
    idea_data["active_message"] = message
    idea_data["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", idea_data)


def _select_focus_idea(ideas: list[dict]) -> dict | None:
    """Pick a single idea to work on, preferring an active or incomplete idea."""
    terminal_states = _load_terminal_states()
    candidates: list[dict] = []

    for entry in ideas:
        idea_id = entry.get("idea_id")
        if not idea_id:
            continue
        data = load_idea_yaml(idea_id, "idea.yaml") or {}
        current_state = data.get("current_state", entry.get("state", "raw_signal_collected"))
        if current_state in terminal_states:
            continue
        if data.get("paused_processing") or idea_id in _paused_idea_ids:
            continue
        candidates.append({
            **entry,
            "current_state": current_state,
            "active_processing": bool(data.get("active_processing", False)),
            "created_at": data.get("created_at", entry.get("created_at", "")),
        })

    if not candidates:
        return None

    active = next((c for c in candidates if c.get("active_processing")), None)
    if active:
        return active

    return sorted(candidates, key=lambda c: c.get("created_at") or "")[0]


def seed_ideas(count: int = 3) -> list[str]:
    """Seed the system with autonomous AI-generated ideas."""
    created = []
    candidates = execute_autonomous_idea_generation(count)
    if not candidates:
        raise RuntimeError("Autonomous idea generation returned no candidates")
    for candidate in candidates:
        title = str(candidate.get("title", "")).strip()
        signal = (
            str(candidate.get("signal_text", "")).strip()
            or str(candidate.get("problem_statement", "")).strip()
            or title
        )
        title = title or signal[:60]
        idea_id = create_idea(signal, title=title)
        created.append(idea_id)

        if candidate.get("problem_statement"):
            update_idea_field(idea_id, "problem_statement", candidate["problem_statement"])
        if candidate.get("solution_concept"):
            update_idea_field(idea_id, "solution_concept", candidate["solution_concept"])
        if candidate.get("siemens_domain"):
            update_idea_field(idea_id, "siemens_domain", candidate["siemens_domain"])
        tags = _as_list(candidate.get("tags"))
        if tags:
            update_idea_field(idea_id, "tags", tags)
        for evidence in _as_list(candidate.get("source_evidence")):
            add_evidence(idea_id, "Autonomous AI Research", evidence)

        # Score
        score_idea(idea_id, "auto-seed")

    return created


def _process_idea(idea_id: str) -> dict:
    """Process a single idea through one workflow step."""
    global _active_idea_id
    _active_idea_id = idea_id

    try:
        if is_idea_paused(idea_id):
            return {"idea_id": idea_id, "status": "paused"}

        machine = get_machine(idea_id)
        current = machine.state

        # Find next available transition
        transitions = machine.machine.get_transitions()
        available = [t for t in transitions if t.source == current]

        if not available:
            return {"idea_id": idea_id, "status": "terminal", "state": current}

        # Try to advance to the first available state
        target = available[0].dest

        _set_active_processing(
            idea_id,
            True,
            agent="workflow-orchestrator",
            state=current,
            message=f"Advancing from {current} to {target}",
        )

        _emit("agent.progress", {
            "idea_id": idea_id,
            "agent": "scheduler",
            "message": f"Advancing {idea_id} from {current} to {target}",
            "state": target,
        })

        result = advance_workflow(idea_id, target)

        if result.get("success"):
            # Score after transition
            score_idea(idea_id, "auto-workflow")

        return {
            "idea_id": idea_id,
            "status": "advanced" if result.get("success") else "blocked",
            "from_state": current,
            "to_state": target if result.get("success") else current,
            "result": result,
        }
    finally:
        _set_active_processing(idea_id, False, agent="", state="", message="")
        _active_idea_id = ""


def run_generation_cycle(max_ideas: int = 10) -> dict:
    """Run one complete generation cycle.
    
    Steps:
    1. Autonomously seed new ideas if the registry is empty
    2. Advance each idea one step forward in the workflow
    3. Score each idea after transition
    4. Identify improvement candidates
    """
    global _cycle_running
    _cycle_running = True

    try:
        registry = load_idea_registry()
        ideas = registry.get("ideas", [])

        results = []

        # Seed if empty
        if not ideas:
            seeded = seed_ideas(max(1, min(3, max_ideas)))
            results.append({"action": "seeded", "ideas": seeded})
            registry = load_idea_registry()
            ideas = registry.get("ideas", [])

        # Process only one focused idea per cycle to keep agent attention single-threaded.
        focus = _select_focus_idea(ideas[:max_ideas])
        if focus:
            if is_idea_paused(focus["idea_id"]):
                results.append({"idea_id": focus["idea_id"], "status": "paused"})
                return {
                    "cycle_complete": True,
                    "ideas_processed": len(results),
                    "results": results,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            result = _process_idea(focus["idea_id"])
            results.append(result)
        else:
            results.append({"status": "idle", "reason": "No incomplete ideas found"})

        return {
            "cycle_complete": True,
            "ideas_processed": len(results),
            "results": results,
            "timestamp": datetime.utcnow().isoformat(),
        }
    finally:
        _cycle_running = False


# ── Full Autonomous Pipeline ──

# Execution chain: each entry maps (state_name, executor_func, archive_filename)
# The pipeline runs these in order for every idea.
_STATE_EXECUTORS = [
    ("idea_discovery",         "execute_idea_discovery",          "discovery.yaml"),
    ("idea_clarification",     "execute_idea_clarification",      "clarification.yaml"),
    ("novelty_hypothesis",     "execute_novelty_hypothesis",      "novelty_hypothesis.yaml"),
    ("prior_art_review",       "execute_prior_art_review",        "prior_art.md"),
    ("detectability_review",   "execute_detectability_review",    "detectability.yaml"),
    ("business_value_review",  "execute_business_value_review",   "business_value.yaml"),
    ("siemens_innovation_alignment", "execute_siemens_alignment", "siemens_alignment.yaml"),
    ("ideascope_draft",        "execute_ideascope_draft",         "ideascope-draft.md"),
    ("siemens_internal_filing_check", "execute_siemens_filing_check", "filing_check.yaml"),
    ("manager_or_enabler_review", "execute_manager_review",        "manager_review.yaml"),
    ("ip_review",              "execute_ip_review",               "ip_review.yaml"),
    ("siemens_ip_counsel_validation", "execute_ip_counsel_validation", "counsel_validation.yaml"),
    ("ready_for_submission",   "execute_ready_for_submission",    "submission_packet.md"),
]


def run_full_pipeline(user_input: str, max_ideas: int = 3,
                      topic_name: str = "", idea_category: str = "",
                      project_name: str = "") -> dict:
    """Run the complete pipeline from autonomous discovery or manual steering to patent-ready.

    Steps:
      1. Generate fresh patent ideas autonomously or from optional user steering
      2. For each idea, run through ALL workflow states sequentially
      3. Execute the LLM subagent for each state
      4. Advance FSM state + score after each execution
      5. Generate final submission-ready packet
      6. Return summary of all ideas and their statuses
    """
    from ..llm.subagent_executor import (
        execute_seed_ideas_from_input,
        run_subagent,
    )

    start_ts = datetime.utcnow().isoformat()
    pipeline_results = []

    # ── Step 1: Generate ideas autonomously or from optional steering ──
    if user_input.strip():
        ideas = execute_seed_ideas_from_input(
            user_input,
            topic_name=topic_name,
            idea_category=idea_category,
            project_name=project_name,
        )
    else:
        ideas = execute_autonomous_idea_generation(max_ideas)

    if not ideas:
        # Retry with the opposite path before failing hard.
        ideas = execute_autonomous_idea_generation(max_ideas)
        if not ideas and user_input.strip():
            ideas = execute_seed_ideas_from_input(
                user_input,
                topic_name=topic_name,
                idea_category=idea_category,
                project_name=project_name,
            )

    if not ideas:
        raise RuntimeError("Autonomous idea generation returned no candidates")

    created_ideas = []
    for candidate in ideas[:max_ideas]:
        if not isinstance(candidate, dict):
            continue

        title = str(candidate.get("title", "")).strip() or str(candidate.get("problem_statement", "Untitled")).strip()[:80]
        signal_text = (
            str(candidate.get("signal_text", "")).strip()
            or (user_input.strip() if user_input.strip() else "")
            or str(candidate.get("problem_statement", "")).strip()
            or title
        )

        idea_id = create_idea(signal_text, title=title)
        if candidate.get("problem_statement"):
            update_idea_field(idea_id, "problem_statement", candidate["problem_statement"])
        if candidate.get("solution_concept"):
            update_idea_field(idea_id, "solution_concept", candidate["solution_concept"])
        if candidate.get("siemens_domain"):
            update_idea_field(idea_id, "siemens_domain", candidate["siemens_domain"])
        tags = _as_list(candidate.get("tags"))
        if tags:
            update_idea_field(idea_id, "tags", tags)
        for evidence in _as_list(candidate.get("source_evidence")):
            add_evidence(idea_id, "Autonomous AI Research", evidence)

        created_ideas.append({
            "idea_id": idea_id,
            "title": title,
        })

    ideas = created_ideas

    # ── Step 2: Process each idea through ALL states ──
    for idea_entry in ideas[:max_ideas]:
        idea_id = idea_entry["idea_id"]
        title = idea_entry.get("title", idea_id)
        state_log = []
        pipeline_ok = True

        _set_active_processing(idea_id, True, agent="full-pipeline", state="raw_signal_collected", message=f"Starting pipeline for {title}")

        _emit("agent.progress", {
            "idea_id": idea_id,
            "agent": "full-pipeline",
            "message": f"Starting pipeline for: {title}",
        })

        # Score the raw idea first as baseline
        score_idea(idea_id, "pipeline-start")
        state_log.append({
            "state": "raw_signal_collected",
            "action": "scored",
            "status": "ok",
        })

        # ── Step 2a: Run each executor in order ──
        for state_name, func_name, archive_file in _STATE_EXECUTORS:
            if is_idea_paused(idea_id):
                state_log.append({
                    "state": state_name,
                    "action": "skipped",
                    "status": "paused",
                })
                pipeline_ok = False
                break

            try:
                _emit("agent.progress", {
                    "idea_id": idea_id,
                    "agent": "full-pipeline",
                    "message": f"Executing state: {state_name}",
                })

                _set_active_processing(
                    idea_id,
                    True,
                    agent=state_name,
                    state=state_name,
                    message=f"Executing {state_name}",
                )

                # Execute the LLM subagent for this state
                result = run_subagent(state_name, idea_id)
                state_log.append({
                    "state": state_name,
                    "action": "executed",
                    "status": "ok",
                    "result_keys": list(result.keys()) if isinstance(result, dict) else [],
                })

                # Advance the FSM to this state
                adv = advance_workflow(idea_id, state_name)
                if adv.get("success"):
                    _emit("idea.transition", {
                        "idea_id": idea_id,
                        "from": adv.get("from_state", ""),
                        "to": state_name,
                    })

                    # Score after transition
                    score_record = score_idea(idea_id, f"pipeline-{state_name}")
                    _emit("idea.scored", {
                        "idea_id": idea_id,
                        "state": state_name,
                        "composite": score_record.get("composite", 0),
                        "breakdown": score_record.get("breakdown", {}),
                        "strength_rating": score_record.get("strength_rating", ""),
                    })
                else:
                    # Gate blocked — log but continue
                    state_log[-1]["gate_blocked"] = adv.get("error", "gate validation failed")
                    pipeline_ok = False

            except Exception as exc:
                state_log.append({
                    "state": state_name,
                    "action": "executed",
                    "status": "error",
                    "error": str(exc),
                })

        # ── Step 2b: Final score and submission packet ──
        if is_idea_paused(idea_id):
            final_score = load_idea_yaml(idea_id, "scores.yaml") or {}
            pipeline_ok = False
        else:
            final_score = score_idea(idea_id, "pipeline-final")
        _emit("idea.scored", {
            "idea_id": idea_id,
            "state": "complete",
            "composite": final_score.get("composite", final_score.get("latest", {}).get("composite", 0)),
            "breakdown": final_score.get("breakdown", final_score.get("latest", {}).get("breakdown", {})),
            "strength_rating": final_score.get("strength_rating", final_score.get("latest", {}).get("strength_rating", "")),
        })

        _emit("gate.passed" if pipeline_ok else "gate.failed", {
            "idea_id": idea_id,
            "gate": "full-pipeline",
        })

        pipeline_results.append({
            "idea_id": idea_id,
            "title": title,
            "status": "ready_for_filing" if pipeline_ok else "partial",
            "composite_score": final_score.get("composite", final_score.get("latest", {}).get("composite", 0)),
            "states_executed": len(state_log),
            "states_failed": sum(1 for s in state_log if s.get("status") == "error"),
            "state_log": state_log,
        })

        _set_active_processing(idea_id, False, agent="", state="", message="Pipeline complete")

    return {
        "pipeline_complete": True,
        "timestamp": start_ts,
        "user_input": user_input[:200],
        "ideas_count": len(pipeline_results),
        "ideas": pipeline_results,
    }
