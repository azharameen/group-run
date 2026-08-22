"""Interrupt management endpoints."""

from fastapi import APIRouter, HTTPException, status

from ...api.schemas import CreateInterruptRequest, InterruptDecisionRequest, InterruptResponse, ResumeInterruptRequest
from ...services.interrupt_service import InterruptDeliveryError, InterruptService

router = APIRouter(prefix="/api/interrupts", tags=["interrupts"])


@router.get("/pending")
def list_pending() -> dict[str, list[dict]]:
    return {"interrupts": InterruptService.instance().list_pending()}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_interrupt(payload: CreateInterruptRequest) -> InterruptResponse:
    try:
        interrupt = InterruptService.instance().create_interrupt(
            payload.thread_id,
            payload.tool_name,
            payload.message,
            payload.tool_input,
            decided_by=payload.decided_by,
            confidence=payload.confidence,
            alternatives=payload.alternatives,
            reasoning=payload.reasoning,
        )
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.patch("/{interrupt_id}/approve")
def approve_interrupt(interrupt_id: str, payload: InterruptDecisionRequest) -> InterruptResponse:
    try:
        interrupt = InterruptService.instance().approve_interrupt(
            interrupt_id,
            payload.decision,
            payload.reason,
            reasoning=payload.reasoning,
        )
        if interrupt is None:
            existing = InterruptService.instance().get_interrupt(interrupt_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Interrupt not found")
            raise HTTPException(status_code=409, detail="Interrupt already resolved")
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.patch("/{interrupt_id}/reject")
def reject_interrupt(interrupt_id: str, payload: InterruptDecisionRequest) -> InterruptResponse:
    try:
        interrupt = InterruptService.instance().reject_interrupt(
            interrupt_id,
            payload.reason,
            reasoning=payload.reasoning,
        )
        if interrupt is None:
            existing = InterruptService.instance().get_interrupt(interrupt_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Interrupt not found")
            raise HTTPException(status_code=409, detail="Interrupt already resolved")
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/{interrupt_id}/resume")
async def resume_interrupt(interrupt_id: str, payload: ResumeInterruptRequest) -> dict:
    """Resume the agent after a HITL decision.

    Builds the decisions list from the interrupt's stored decision/reason and re-invokes
    the agent runtime with ``Command(resume=...)`` using the same thread_id. Returns the
    final response. Never fabricates a result — if there is no resumable state, 409.
    """
    from ...agent.runner import resume_agent

    interrupt = InterruptService.instance().get_interrupt(interrupt_id)
    if interrupt is None:
        raise HTTPException(status_code=404, detail="Interrupt not found")
    if interrupt["status"] not in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail="Interrupt not resolved")

    if interrupt["status"] == "approved":
        decisions = [{"type": "approve"}]
    else:
        decisions = [{"type": "reject", "message": interrupt.get("reason") or "User rejected this action. Do not retry."}]

    try:
        final_state = await resume_agent(interrupt["thread_id"], decisions)
    except Exception as exc:  # noqa: BLE001  # no resumable state → 409, never fabricate
        raise HTTPException(status_code=409, detail=f"no resumable state: {exc}") from exc

    response = final_state.get("output", final_state.get("messages", ""))
    if isinstance(response, list) and response:
        last = response[-1]
        response = getattr(last, "content", str(last))
    return {"interrupt": interrupt, "response": str(response)}
