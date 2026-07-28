"""Human-in-the-Loop (HITL) approval and interrupt management endpoints."""

from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...orchestrator.tools import get_machine
from ...storage.yaml_io import load_idea_yaml as load_idea, save_idea_yaml as save_idea

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
    _PENDING_INTERRUPTS[idea_id].append({
        "id": f"int_{len(_PENDING_INTERRUPTS[idea_id])+1}",
        "type": interrupt_type,
        "details": details,
        "status": "PENDING"
    })


@router.post("/{idea_id}/approve")
async def approve_idea(idea_id: str, req: ApprovalDecision) -> dict[str, Any]:
    """Approve a pending review state or interrupt gate."""
    idea_data = load_idea(idea_id, "idea.yaml")
    if not idea_data:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    current_state = idea_data.get("workflow_state", "")
    machine = get_machine(idea_id)

    # Persist decision log
    reviews = idea_data.get("reviews", {})
    reviews[req.reviewer.lower()] = {
        "status": req.decision,
        "comments": req.comments,
        "timestamp": "now"
    }
    idea_data["reviews"] = reviews
    save_idea(idea_id, "idea.yaml", idea_data)

    # Resolve pending interrupts
    if idea_id in _PENDING_INTERRUPTS:
        _PENDING_INTERRUPTS[idea_id] = [
            i for i in _PENDING_INTERRUPTS[idea_id] if i["status"] != "PENDING"
        ]

    # Advance state machine if ready
    try:
        if current_state == "MANAGER_REVIEW":
            machine.approve_manager()
        elif current_state == "IP_REVIEW":
            machine.approve_ip()
        elif current_state == "COUNSEL_VALIDATION":
            machine.validate_counsel()
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
    reviews = idea_data.get("reviews", {})
    reviews[req.reviewer.lower()] = {
        "status": "REJECTED",
        "comments": req.comments,
        "timestamp": "now"
    }
    idea_data["reviews"] = reviews
    save_idea(idea_id, "idea.yaml", idea_data)

    # Transition to revision state
    try:
        machine.request_changes()
    except Exception as exc:
        print(f"[Rejection] Transition warning for {idea_id}: {exc}")

    updated_data = load_idea(idea_id, "idea.yaml") or {}
    return {
        "success": True,
        "idea_id": idea_id,
        "new_state": updated_data.get("workflow_state"),
        "decision": "REJECTED",
        "comments": req.comments
    }
