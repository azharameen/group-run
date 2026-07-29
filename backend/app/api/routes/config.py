"""Configuration and static metadata endpoints."""

import json
import os

from fastapi import APIRouter

from ...config import CONFIG_DIR, KNOWLEDGE_BASE_DIR, WORKSPACE_DIR
from ...models.idea import WorkflowState
from ...infrastructure.observability import get_observability_status
from ...storage.yaml_io import read_yaml


router = APIRouter(prefix="/api/config", tags=["config"])


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


@router.get("/workflow")
async def get_workflow_config() -> dict:
    return {
        "states": STATE_LABELS,
        "phases": PHASE_META,
        "ordered_states": [state.value for state in WorkflowState],
    }


@router.get("/gates")
async def get_gate_config() -> dict:
    path = os.path.join(CONFIG_DIR, "checklist-config.yaml")
    if not os.path.exists(path):
        return {"gates": []}
    config = read_yaml(path)
    gates = config.get("gates", {}) if isinstance(config, dict) else {}
    return {"gates": gates}


@router.get("/topics")
async def get_topics() -> list:
    path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "topics-list.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return []


@router.get("/projects")
async def get_projects() -> list:
    path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "projects-list.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return []


@router.get("/criteria")
async def get_criteria_config() -> dict:
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


@router.get("/siemens-domains")
async def get_siemens_domains() -> dict:
    path = os.path.join(os.path.dirname(WORKSPACE_DIR), "knowledge-base", "siemens", "tech_domains.yaml")
    if os.path.exists(path):
        return read_yaml(path)
    return {"error": "Tech domains file not found"}


@router.get("/observability")
async def get_observability() -> dict:
    return get_observability_status()
