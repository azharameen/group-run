"""FastAPI application entry point with SSE streaming."""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .config import settings, WORKSPACE_DIR, CONFIG_DIR, KNOWLEDGE_BASE_DIR
from .models.idea import WorkflowState, PHASE_GROUPS
from .orchestrator.tools import (
    create_idea,
    advance_workflow,
    score_idea,
    validate_gate,
    update_idea_field,
    add_evidence,
    advance_to_next_state,
    get_all_machines,
    set_emit_sse_callback as tools_set_emit,
    delete_idea,
    set_idea_paused,
)
from .orchestrator.workflow import (
    run_generation_cycle,
    seed_ideas,
    run_full_pipeline,
    get_active_idea,
    set_emit_sse_callback as workflow_set_emit,
    pause_idea,
    resume_idea,
)
from .state.machine import set_emit_sse_callback as state_set_emit
from .scheduler import start_scheduler, stop_scheduler
from .storage.yaml_io import (
    load_idea_registry,
    load_idea_yaml,
    load_knowledge_base,
    recover_from_filesystem,
    read_yaml,
    read_markdown,
    get_all_idea_files,
    load_comments,
    save_comment,
)

# ── SSE Event Bus ──

_sse_clients: list[asyncio.Queue] = []


async def _sse_event_generator() -> AsyncGenerator[dict, None]:
    """SSE generator that yields events to all connected clients."""
    queue: asyncio.Queue = asyncio.Queue()
    _sse_clients.append(queue)
    try:
        while True:
            event = await queue.get()
            yield {
                "event": event["type"],
                "data": json.dumps(event["data"]),
            }
    except asyncio.CancelledError:
        pass
    finally:
        _sse_clients.remove(queue)


def emit_sse(event_type: str, data: dict):
    """Push an SSE event to all connected dashboard clients."""
    # Clean up disconnected clients
    dead = [q for q in _sse_clients if q.empty() is False and q.qsize() > 100]
    for q in dead:
        try:
            _sse_clients.remove(q)
        except ValueError:
            pass

    for queue in _sse_clients:
        try:
            queue.put_nowait({"type": event_type, "data": data})
        except asyncio.QueueFull:
            pass


# ── Lifespan ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: register SSE callbacks
    tools_set_emit(emit_sse)
    workflow_set_emit(emit_sse)
    state_set_emit(emit_sse)

    # Recover ideas from filesystem that may have been created before restart
    recovered = recover_from_filesystem()
    if recovered > 0:
        print(f"[Startup] Recovered {recovered} idea(s) from filesystem")
    
    # Rebuild workflow machines for all registered ideas
    registry = load_idea_registry()
    for entry in registry.get("ideas", []):
        idea_id = entry["idea_id"]
        try:
            from .orchestrator.tools import get_machine
            get_machine(idea_id)  # Creates/reloads the FSM
        except Exception as e:
            print(f"[Startup] Warning: could not load machine for {idea_id}: {e}")

    # Start autonomous scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()


# ── App ──

app = FastAPI(
    title="Siemens Patent Idea Generator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST Endpoints ──

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
    }


@app.get("/api/sse")
async def sse_stream(request: Request):
    """SSE endpoint: dashboard clients connect here for live updates."""
    return EventSourceResponse(_sse_event_generator())


@app.get("/api/ideas")
async def list_ideas(
    phase: Optional[str] = None,
    state: Optional[str] = None,
    min_score: Optional[float] = None,
):
    """List all ideas with optional filtering."""
    registry = load_idea_registry()
    ideas_list = registry.get("ideas", [])

    result = []
    for entry in ideas_list:
        idea_id = entry["idea_id"]
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        scores = load_idea_yaml(idea_id, "scores.yaml") or {}
        latest_score = scores.get("latest", {})
        composite = latest_score.get("composite", 0)

        # Apply filters
        if phase and idea_data.get("phase") != phase:
            continue
        if state and idea_data.get("current_state") != state:
            continue
        if min_score is not None and (composite or 0) < min_score:
            continue

        result.append({
            "idea_id": idea_id,
            "title": idea_data.get("title", entry.get("title", "")),
            "phase": idea_data.get("phase", "discovery"),
            "state": idea_data.get("current_state", "raw_signal_collected"),
            "composite_score": composite,
            "strength_rating": latest_score.get("strength_rating", ""),
            "running_agent": idea_data.get("running_agent", ""),
            "active_processing": idea_data.get("active_processing", False),
            "paused_processing": idea_data.get("paused_processing", False),
            "active_agent": idea_data.get("active_agent", ""),
            "active_state": idea_data.get("active_state", ""),
            "created_at": idea_data.get("created_at", ""),
            "updated_at": idea_data.get("updated_at", ""),
        })

    return {"ideas": result, "count": len(result)}


@app.get("/api/ideas/{idea_id}")
async def get_idea(idea_id: str):
    """Get full idea details."""
    idea_data = load_idea_yaml(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail=f"Idea {idea_id} not found")

    state_data = load_idea_yaml(idea_id, "state.yaml") or {}
    scores_data = load_idea_yaml(idea_id, "scores.yaml") or {}

    return {
        "idea": idea_data,
        "state": state_data,
        "scores": scores_data,
        "comments": load_comments(idea_id),
    }


@app.get("/api/ideas/{idea_id}/files")
async def get_idea_files(idea_id: str):
    """Get all workspace files for a specific idea."""
    files = get_all_idea_files(idea_id)
    return {"idea_id": idea_id, "files": files, "count": len(files)}


@app.post("/api/ideas")
async def create_new_idea(payload: dict):
    """Create a new idea.
    
    When signal_text is empty/omitted, the idea is generated autonomously
    from knowledge base content (the autonomous discovery path).
    signal_text is only required when explicitly steering the idea.
    """
    signal_text = payload.get("signal_text", "")
    title = payload.get("title", "")

    if not signal_text:
        # Autonomous generation from KB
        kb_docs = load_knowledge_base()
        if kb_docs:
            contexts = []
            for doc in kb_docs[:3]:  # Top 3 docs as context
                content = doc.get("content", "")
                if isinstance(content, str) and len(content) > 50:
                    contexts.append(content[:200])
            if contexts:
                signal_text = "Autonomous discovery from KB: " + " | ".join(contexts)
            else:
                signal_text = "Autonomous discovery (knowledge base)"
        else:
            signal_text = "Autonomous discovery (no KB documents found)"

    idea_id = create_idea(signal_text, title)
    # Auto-score on creation
    score_result = score_idea(idea_id, "api-create")

    return {
        "idea_id": idea_id,
        "score": score_result,
        "message": f"Idea {idea_id} created and scored",
    }


@app.post("/api/ideas/{idea_id}/advance")
async def advance_idea(idea_id: str, payload: Optional[dict] = None):
    """Advance an idea to the next or specified state."""
    target = payload.get("target_state") if payload else None

    if target:
        result = advance_workflow(idea_id, target)
    else:
        result = advance_to_next_state(idea_id)

    return result


@app.post("/api/ideas/{idea_id}/score")
async def score_idea_endpoint(idea_id: str):
    """Score an idea using all 7 criteria."""
    result = score_idea(idea_id, "api-manual")
    return result


@app.post("/api/ideas/{idea_id}/validate-gate")
async def validate_gate_endpoint(idea_id: str, payload: dict):
    """Run a specific gate checklist."""
    gate_name = payload.get("gate_name", "")
    result = validate_gate(idea_id, gate_name)
    return result


@app.post("/api/ideas/{idea_id}/update")
async def update_idea(idea_id: str, payload: dict):
    """Update a field on an idea."""
    field = payload.get("field", "")
    value = payload.get("value", "")
    result = update_idea_field(idea_id, field, value)
    return result


@app.post("/api/ideas/{idea_id}/evidence")
async def add_evidence_endpoint(idea_id: str, payload: dict):
    """Add source evidence to an idea."""
    source = payload.get("source", "")
    content = payload.get("content", "")
    result = add_evidence(idea_id, source, content)
    return result


@app.delete("/api/ideas/{idea_id}")
async def delete_idea_endpoint(idea_id: str):
    return delete_idea(idea_id)


@app.post("/api/ideas/{idea_id}/pause")
async def pause_idea_endpoint(idea_id: str):
    pause_idea(idea_id)
    return set_idea_paused(idea_id, True)


@app.post("/api/ideas/{idea_id}/resume")
async def resume_idea_endpoint(idea_id: str):
    resume_idea(idea_id)
    return set_idea_paused(idea_id, False)


@app.post("/api/ideas/{idea_id}/comment")
async def add_comment_endpoint(idea_id: str, payload: dict):
    author = str(payload.get("author", "User")).strip() or "User"
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")
    comment = save_comment(idea_id, author, text)
    return {"idea_id": idea_id, "comment": comment}


@app.post("/api/workflow/cycle")
async def trigger_cycle():
    """Manually trigger a generation cycle."""
    result = run_generation_cycle()
    return result


@app.post("/api/workflow/seed")
async def trigger_seed(payload: Optional[dict] = None):
    """Seed the system with autonomous AI-generated ideas."""
    count = payload.get("count", 3) if payload else 3
    created = seed_ideas(count)
    return {"seeded": created, "count": len(created)}


@app.get("/api/phases")
async def get_phases():
    """Get phase groupings for dashboard."""
    return {
        "phases": {
            name: [s.value for s in states]
            for name, states in PHASE_GROUPS.items()
        }
    }


@app.get("/api/knowledge-base")
async def get_knowledge_base():
    """Return all knowledge base documents with their actual content."""
    docs = load_knowledge_base()
    return {
        "documents": docs,
        "count": len(docs),
        "sources": {
            "raw": len([d for d in docs if d["source"] == "raw"]),
            "processed": len([d for d in docs if d["source"] == "processed"]),
        },
    }


@app.get("/api/workflow/status")
async def workflow_status():
    """Return the currently active idea and queued ideas for the scheduler/UI."""
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


@app.get("/api/config/siemens-domains")
async def get_siemens_domains():
    """Get Siemens strategic technology domains."""
    path = os.path.join(os.path.dirname(WORKSPACE_DIR), "knowledge-base", "siemens", "tech_domains.yaml")
    if os.path.exists(path):
        return read_yaml(path)
    return {"error": "Tech domains file not found"}


# ── Config Endpoints ──

STATE_LABELS: dict[str, dict] = {
    "raw_signal_collected": {"label": "1. Raw Signal Collected", "phase": "discovery", "description": "Initial signal or technology trend ingested into pipeline."},
    "idea_discovery": {"label": "2. Idea Discovery", "phase": "discovery", "description": "Autonomous agent extracts core idea concept."},
    "idea_clarification": {"label": "3. Idea Clarification", "phase": "discovery", "description": "Refining problem statement and target domain."},
    "novelty_hypothesis": {"label": "4. Novelty Hypothesis", "phase": "research", "description": "Formulating non-obviousness argument."},
    "prior_art_review": {"label": "5. Prior Art Review", "phase": "research", "description": "Searching Google Patents, USPTO & EPO for existing art."},
    "detectability_review": {"label": "6. Detectability Review", "phase": "research", "description": "Evaluating how infringement can be detected."},
    "business_value_review": {"label": "7. Business Value Review", "phase": "analysis", "description": "Evaluating economic value and market impact."},
    "siemens_innovation_alignment": {"label": "8. Siemens Alignment", "phase": "analysis", "description": "Matching with Siemens strategic business units."},
    "ideascope_draft": {"label": "9. IdeaScope Draft", "phase": "drafting", "description": "Drafting structured Siemens IdeaScope disclosure."},
    "siemens_internal_filing_check": {"label": "10. Internal Filing Check", "phase": "drafting", "description": "Verifying mandatory Siemens disclosure fields."},
    "manager_or_enabler_review": {"label": "11. Manager Review", "phase": "review", "description": "Siemens innovation manager sign-off."},
    "ip_review": {"label": "12. IP Department Review", "phase": "review", "description": "Internal IP team prior art assessment."},
    "siemens_ip_counsel_validation": {"label": "13. IP Counsel Validation", "phase": "review", "description": "Written legal patentability validation."},
    "ready_for_submission": {"label": "14. Ready for Submission", "phase": "submission", "description": "All gate checks passed for formal filing."},
    "submitted": {"label": "15. Formally Submitted", "phase": "submission", "description": "Submitted to Siemens IP filing system."},
    "feedback_received": {"label": "16. Feedback Received", "phase": "submission", "description": "Reviewer or patent office response."},
    "accepted_or_closed": {"label": "17. Accepted / Closed", "phase": "submission", "description": "Filing accepted and registered."},
    "revision_in_progress": {"label": "18. Revision in Progress", "phase": "revision", "description": "Active revision based on feedback."},
    "on_hold": {"label": "19. On Hold", "phase": "archive", "description": "Temporarily deferred for future context."},
    "archived": {"label": "20. Archived", "phase": "archive", "description": "Pipeline run archived."},
}

PHASE_META: dict[str, dict] = {
    "discovery": {"label": "Discovery", "color": "amber"},
    "research": {"label": "Research", "color": "blue"},
    "analysis": {"label": "Analysis", "color": "emerald"},
    "drafting": {"label": "Drafting", "color": "orange"},
    "review": {"label": "Review", "color": "purple"},
    "submission": {"label": "Submission", "color": "emerald"},
    "revision": {"label": "Revision", "color": "amber"},
    "archive": {"label": "Archive", "color": "slate"},
}


@app.get("/api/config/workflow")
async def get_workflow_config():
    """Return workflow state definitions with labels, phases, and descriptions."""
    return {
        "states": STATE_LABELS,
        "phases": PHASE_META,
        "ordered_states": [s.value for s in WorkflowState],
    }


@app.get("/api/config/gates")
async def get_gate_config():
    """Return gate checklists from checklist-config.yaml."""
    path = os.path.join(CONFIG_DIR, "checklist-config.yaml")
    if not os.path.exists(path):
        return {"gates": []}
    config = read_yaml(path)
    gates = config.get("gates", {}) if isinstance(config, dict) else {}
    return {"gates": gates}


@app.get("/api/config/topics")
async def get_topics():
    """Return available topics from knowledge-base."""
    path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "topics-list.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


@app.get("/api/config/projects")
async def get_projects():
    """Return existing projects list from knowledge-base."""
    path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "projects-list.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


@app.get("/api/config/criteria")
async def get_criteria_config():
    """Return scoring criteria config."""
    path = os.path.join(CONFIG_DIR, "system-config.yaml")
    if not os.path.exists(path):
        return {"criteria": {}, "strength_ratings": [], "thresholds": {}}
    config = read_yaml(path) or {}
    scoring = config.get("scoring", {}) if isinstance(config, dict) else {}
    return {
        "criteria": scoring.get("criteria", {}),
        "strength_ratings": scoring.get("strength_ratings", {}),
        "thresholds": {
            "composite_threshold": scoring.get("composite_threshold", 70),
            "gate_threshold_percent": scoring.get("gate_threshold_percent", 50),
        },
    }



# ── Pipeline Request Model ──


class PipelineRequest(BaseModel):
    input_text: str = ""
    max_ideas: int = 3
    topic_id: int = 0
    topic_name: str = ""
    idea_category: str = "New Product Idea"
    project_id: int = 0
    project_name: str = ""


class PipelineResponse(BaseModel):
    pipeline_complete: bool
    timestamp: str
    user_input: str
    ideas_count: int
    ideas: list[dict]


@app.post("/api/submit-pipeline", response_model=PipelineResponse)
async def submit_pipeline(req: PipelineRequest):
    """Submit optional steering text and run the FULL autonomous pipeline.

    With empty input, the pipeline generates ideas autonomously from the
    knowledge corpus and research context.
    """
    # Run in a thread to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, run_full_pipeline, req.input_text, req.max_ideas,
        req.topic_name, req.idea_category, req.project_name,
    )
    return result


@app.post("/api/workflow/autonomous", response_model=PipelineResponse)
async def autonomous_pipeline(req: PipelineRequest):
    """Generate ideas autonomously without user steering text."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_full_pipeline, "", req.max_ideas)
    return result


@app.post("/api/auto-pipeline")
async def auto_pipeline(req: PipelineRequest):
    """Alias for /api/submit-pipeline — same full autonomous pipeline."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, run_full_pipeline, req.input_text, req.max_ideas,
        req.topic_name, req.idea_category, req.project_name,
    )
    return result


class StatsResponse(BaseModel):
    total_ideas: int = 0
    by_phase: dict[str, int] = {}
    by_state: dict[str, int] = {}
    average_score: float = 0.0
    ideas_above_threshold: int = 0
    ideas_at_threshold: int = 0


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    """Get system statistics."""
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

    avg_score = round(total_score / scored_count, 1) if scored_count else 0.0

    return StatsResponse(
        total_ideas=len(ideas_list),
        by_phase=by_phase,
        by_state=by_state,
        average_score=avg_score,
        ideas_above_threshold=above_threshold,
        ideas_at_threshold=sum(
            1 for e in ideas_list
            if load_idea_yaml(e["idea_id"], "scores.yaml") or {}
            and (load_idea_yaml(e["idea_id"], "scores.yaml") or {}).get("latest", {}).get("composite", 0) >= settings.composite_threshold
        ),
    )
