"""Human-in-the-Loop (HITL) approval and interrupt management endpoints."""

from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...orchestrator.tools import get_machine
from ...orchestrator.workflow import pause_idea, resume_idea
from ...storage.yaml_io import load_idea_yaml as load_idea, save_idea_yaml as save_idea, save_transcript_event

router = APIRouter(prefix="/api/workflow", tags=["approvals"])

# In-memory store for pending HITL interrupts
_PENDING_INTERRUPTS: dict[str, list[dict[str, Any]]] = {}


class ApprovalDecision(BaseModel):
    reviewer: str = "Manager"
    decision: str = "APPROVED"  # APPROVED or REJECTED
    comments: str = ""


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


def add_pending_interrupt(idea_id: str, interrupt_type: str, details: str):
    """Utility helper to record a pending human approval interrupt."""
    if idea_id not in _PENDING_INTERRUPTS:
        _PENDING_INTERRUPTS[idea_id] = []
    interrupt = {
        "id": f"int_{len(_PENDING_INTERRUPTS[idea_id])+1}",
        "type": interrupt_type,
        "details": details,
        "status": "PENDING"
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
    save_transcript_event(idea_id, {
        "type": "approval",
        "speaker": req.reviewer,
        "role": "reviewer",
        "decision": req.decision.lower(),
        "reason": req.comments,
        "content": f"{req.reviewer} approved interrupt gate" if req.decision.upper() == "APPROVED" else f"{req.reviewer} rejected interrupt gate",
        "provenance": f"approval:{idea_id}",
    })

    # Resolve pending interrupts and resume the workflow once approved/rejected.
    _resolve_pending_interrupts(
        idea_id,
        "RESOLVED" if req.decision.upper() == "APPROVED" else "REJECTED",
        req.reviewer,
        req.comments,
    )

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
        "comments": req.comments
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
    save_transcript_event(idea_id, {
        "type": "failed",
        "speaker": req.reviewer,
        "role": "reviewer",
        "decision": "reject",
        "reason": req.comments,
        "content": f"{req.reviewer} requested revisions",
        "provenance": f"approval:{idea_id}",
    })

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
