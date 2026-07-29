"""Human-in-the-Loop (HITL) approval and interrupt management endpoints."""

from typing import Any
import os
from collections import Counter
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ... import config as app_config
from ...orchestrator.tools import get_machine, delete_idea, archive_idea
from ...orchestrator.workflow import pause_idea, resume_idea
from ...storage.yaml_io import (
    load_idea_yaml as load_idea,
    load_idea_registry,
    save_idea_yaml as save_idea,
    save_transcript_event,
)
from ...orchestrator.tools import build_review_packet

router = APIRouter(prefix="/api/workflow", tags=["approvals"])

# In-memory store for pending HITL interrupts
_PENDING_INTERRUPTS: dict[str, list[dict[str, Any]]] = {}


class ApprovalDecision(BaseModel):
    reviewer: str = "Manager"
    reviewer_id: str = ""
    reviewer_role: str = ""
    decision: str = "APPROVED"  # APPROVED or REJECTED
    comments: str = ""

    def normalized_role(self) -> str:
        role = (self.reviewer_role or self.reviewer or "").strip().lower()
        return role or "reviewer"


@router.get("/interrupts")
async def list_interrupts(idea_id: str | None = None) -> dict[str, Any]:
    """Get all pending HITL interrupt items waiting for user feedback."""
    if idea_id:
        items = _PENDING_INTERRUPTS.get(idea_id, [])
        return {"idea_id": idea_id, "pending_interrupts": items}
    
    all_items = []
    for i_id, items in _PENDING_INTERRUPTS.items():
        for item in items:
            all_items.append({"idea_id": i_id, **item})
    return {"pending_interrupts": all_items, "total_count": len(all_items)}


@router.get("/analytics")
async def review_analytics() -> dict[str, Any]:
    registry = load_idea_registry()
    reviewer_counts: Counter[str] = Counter()
    decision_counts: Counter[str] = Counter()
    pending_counts: Counter[str] = Counter()
    reviewed_ideas = 0
    seen_ids: set[str] = set()

    candidates: list[str] = []
    for idea in registry.get("ideas", []):
        idea_id = idea.get("idea_id")
        if idea_id:
            candidates.append(idea_id)

    ideas_root = os.path.join(app_config.WORKSPACE_DIR, "ideas")
    if os.path.exists(ideas_root):
        for idea_id in os.listdir(ideas_root):
            if os.path.isdir(os.path.join(ideas_root, idea_id)):
                candidates.append(idea_id)

    for idea_id in candidates:
        if idea_id in seen_ids:
            continue
        seen_ids.add(idea_id)
        idea_data = load_idea(idea_id, "idea.yaml") or {}
        reviews = idea_data.get("reviews", {})
        if reviews:
            reviewed_ideas += 1
        for reviewer_role, review in reviews.items():
            reviewer_counts[reviewer_role] += 1
            decision_counts[str(review.get("status", "unknown")).lower()] += 1

    for items in _PENDING_INTERRUPTS.values():
        for item in items:
            pending_counts[item.get("type", "unknown")] += 1

    return {
        "reviewed_ideas": reviewed_ideas,
        "reviewer_counts": dict(reviewer_counts),
        "decision_counts": dict(decision_counts),
        "pending_interrupts": dict(pending_counts),
        "total_pending_interrupts": sum(pending_counts.values()),
    }


def add_pending_interrupt(idea_id: str, interrupt_type: str, details: str):
    """Utility helper to record a pending human approval interrupt."""
    if idea_id not in _PENDING_INTERRUPTS:
        _PENDING_INTERRUPTS[idea_id] = []
    interrupt = {
        "id": f"int_{len(_PENDING_INTERRUPTS[idea_id])+1}",
        "type": interrupt_type,
        "details": details,
        "status": "PENDING",
    }
    _PENDING_INTERRUPTS[idea_id].append(interrupt)
    pause_idea(idea_id)
    save_transcript_event(idea_id, {
        "type": "interrupt",
        "speaker": "Workflow Orchestrator",
        "role": "orchestrator",
        "interrupt_id": interrupt["id"],
        "reason": details,
        "content": details,
        "provenance": f"interrupt:{idea_id}:{interrupt['id']}",
    })
    build_review_packet(idea_id, interrupt_type)


def _record_review(idea_data: dict[str, Any], reviewer: str, status: str, comments: str) -> None:
    reviews = idea_data.get("reviews", {})
    reviews[reviewer.lower()] = {
        "status": status,
        "comments": comments,
        "timestamp": "now",
    }
    idea_data["reviews"] = reviews


def _resolve_pending_interrupts(idea_id: str, final_status: str, reviewer: str, comments: str) -> None:
    pending = _PENDING_INTERRUPTS.get(idea_id, [])
    if not pending:
        return
    for interrupt in pending:
        if interrupt["status"] == "PENDING":
            interrupt["status"] = final_status
            interrupt["resolved_by"] = reviewer
            interrupt["resolved_at"] = comments or "now"
    _PENDING_INTERRUPTS[idea_id] = [item for item in pending if item["status"] == "PENDING"]
    if not _PENDING_INTERRUPTS[idea_id]:
        resume_idea(idea_id)


def _apply_special_interrupt_actions(idea_id: str, decision: str) -> dict[str, Any] | None:
    pending = _PENDING_INTERRUPTS.get(idea_id, [])
    if decision.upper() != "APPROVED":
        return None

    special = next((item for item in pending if item.get("type") in {"delete", "archive"} and item.get("status") == "PENDING"), None)
    if not special:
        return None

    interrupt_type = special.get("type")
    if interrupt_type == "delete":
        return delete_idea(idea_id)
    if interrupt_type == "archive":
        return archive_idea(idea_id)
    return None


def _advance_review_state(machine, current_state: str) -> None:
    state = str(current_state or "").strip().lower()
    if state in {"manager_review", "manager_or_enabler_review"}:
        machine.approve_manager()
    elif state == "ip_review":
        machine.approve_ip()
    elif state in {"counsel_validation", "siemens_ip_counsel_validation"}:
        machine.validate_counsel()


@router.post("/{idea_id}/approve")
async def approve_idea(idea_id: str, req: ApprovalDecision) -> dict[str, Any]:
    """Approve a pending review state or interrupt gate."""
    idea_data = load_idea(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    current_state = idea_data.get("workflow_state") or idea_data.get("current_state") or ""
    machine = get_machine(idea_id)

    # Persist decision log
    _record_review(idea_data, req.reviewer, req.decision, req.comments)
    save_idea(idea_id, "idea.yaml", idea_data)
    reviewer_role = req.normalized_role()
    save_transcript_event(idea_id, {
        "type": "approval",
        "speaker": req.reviewer,
        "role": "reviewer",
        "decision": req.decision.lower(),
        "reason": req.comments,
        "content": f"{req.reviewer} approved interrupt gate" if req.decision.upper() == "APPROVED" else f"{req.reviewer} rejected interrupt gate",
        "provenance": f"approval:{idea_id}",
        "metadata": {
            "reviewer_id": req.reviewer_id,
            "reviewer_role": reviewer_role,
        },
    })
    build_review_packet(idea_id, reviewer_role)

    special_action = _apply_special_interrupt_actions(idea_id, req.decision)

    # Resolve pending interrupts and resume the workflow once approved/rejected.
    _resolve_pending_interrupts(
        idea_id,
        "RESOLVED" if req.decision.upper() == "APPROVED" else "REJECTED",
        req.reviewer,
        req.comments,
    )

    if not special_action:
        # Advance state machine if ready
        try:
            _advance_review_state(machine, current_state)
        except Exception as exc:
            print(f"[Approval] Transition warning for {idea_id}: {exc}")

    updated_data = load_idea(idea_id, "idea.yaml") or {}
    return {
        "success": True,
        "idea_id": idea_id,
        "new_state": updated_data.get("workflow_state"),
        "decision": req.decision,
        "comments": req.comments,
        "special_action": special_action,
    }


@router.post("/{idea_id}/reject")
async def reject_idea(idea_id: str, req: ApprovalDecision) -> dict[str, Any]:
    """Reject a pending review gate and request revisions."""
    idea_data = load_idea(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")

    machine = get_machine(idea_id)
    _record_review(idea_data, req.reviewer, "REJECTED", req.comments)
    save_idea(idea_id, "idea.yaml", idea_data)
    reviewer_role = req.normalized_role()
    save_transcript_event(idea_id, {
        "type": "failed",
        "speaker": req.reviewer,
        "role": "reviewer",
        "decision": "reject",
        "reason": req.comments,
        "content": f"{req.reviewer} requested revisions",
        "provenance": f"approval:{idea_id}",
        "metadata": {
            "reviewer_id": req.reviewer_id,
            "reviewer_role": reviewer_role,
        },
    })
    build_review_packet(idea_id, reviewer_role)

    # Transition to revision state
    try:
        machine.request_changes()
    except Exception as exc:
        print(f"[Rejection] Transition warning for {idea_id}: {exc}")

    _resolve_pending_interrupts(idea_id, "REJECTED", req.reviewer, req.comments)

    updated_data = load_idea(idea_id, "idea.yaml") or {}
    return {
        "success": True,
        "idea_id": idea_id,
        "new_state": updated_data.get("workflow_state"),
        "decision": "REJECTED",
        "comments": req.comments
    }
