"""Interrupt management endpoints."""

from contextlib import nullcontext

from fastapi import APIRouter, HTTPException, Request, status

from ...api.schemas import CreateInterruptRequest, InterruptDecisionRequest, InterruptResponse, ResumeInterruptRequest
from ...auth.middleware import get_request_principal
from ...providers.service import ProviderConfigService
from ...services.interrupt_service import InterruptDeliveryError, InterruptService
from ...services.thread_manager import get_or_claim_thread

router = APIRouter(prefix="/api/interrupts", tags=["interrupts"])
provider_service = ProviderConfigService()


@router.get("/pending")
async def list_pending(request: Request) -> dict[str, list[dict]]:
    pending = await InterruptService.instance().list_pending_for_owner(
        get_request_principal(request).uid
    )
    return {"interrupts": pending}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_interrupt(payload: CreateInterruptRequest, request: Request) -> InterruptResponse:
    try:
        if not await get_or_claim_thread(
            payload.thread_id, get_request_principal(request).uid
        ):
            raise HTTPException(status_code=404, detail="Thread not found")
        interrupt = await InterruptService.instance().create_interrupt(
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
async def approve_interrupt(
    interrupt_id: str, payload: InterruptDecisionRequest, request: Request
) -> InterruptResponse:
    try:
        existing = await InterruptService.instance().get_interrupt(interrupt_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Interrupt not found")
        if not await get_or_claim_thread(
            existing["thread_id"], get_request_principal(request).uid
        ):
            raise HTTPException(status_code=404, detail="Interrupt not found")
        interrupt = await InterruptService.instance().approve_interrupt(
            interrupt_id,
            payload.decision,
            payload.reason,
            reasoning=payload.reasoning,
        )
        if interrupt is None:
            existing = await InterruptService.instance().get_interrupt(interrupt_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Interrupt not found")
            raise HTTPException(status_code=409, detail="Interrupt already resolved")
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.patch("/{interrupt_id}/reject")
async def reject_interrupt(
    interrupt_id: str, payload: InterruptDecisionRequest, request: Request
) -> InterruptResponse:
    try:
        existing = await InterruptService.instance().get_interrupt(interrupt_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Interrupt not found")
        if not await get_or_claim_thread(
            existing["thread_id"], get_request_principal(request).uid
        ):
            raise HTTPException(status_code=404, detail="Interrupt not found")
        interrupt = await InterruptService.instance().reject_interrupt(
            interrupt_id,
            payload.reason,
            reasoning=payload.reasoning,
        )
        if interrupt is None:
            existing = await InterruptService.instance().get_interrupt(interrupt_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Interrupt not found")
            raise HTTPException(status_code=409, detail="Interrupt already resolved")
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/{interrupt_id}/resume")
async def resume_interrupt(
    interrupt_id: str, payload: ResumeInterruptRequest, request: Request
) -> dict:
    """Resume the agent after a HITL decision.

    Builds the decisions list from the interrupt's stored decision/reason and re-invokes
    the agent runtime with ``Command(resume=...)`` using the same thread_id. Returns the
    final response. Never fabricates a result — if there is no resumable state, 409.
    """
    from ...agent.runner import resume_agent

    interrupt = await InterruptService.instance().get_interrupt(interrupt_id)
    if interrupt is None:
        raise HTTPException(status_code=404, detail="Interrupt not found")
    if interrupt["status"] not in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail="Interrupt not resolved")
    principal = get_request_principal(request)
    thread = await get_or_claim_thread(interrupt["thread_id"], principal.uid)
    if not thread:
        raise HTTPException(status_code=404, detail="Interrupt not found")
    # Resolve the thread's persisted pair; threads without one fall back to the
    # user default or, in CI/local fallback mode (DEEPAGENTS_MODEL), the
    # environment model — mirroring the initial stream request.
    try:
        provider_id, model_id, definition = await provider_service.resolve_model(
            principal.uid, thread.get("provider_id"), thread.get("model_id")
        )
    except (LookupError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if interrupt["status"] == "approved":
        decisions = [{"type": "approve"}]
    else:
        decisions = [{"type": "reject", "message": interrupt.get("reason") or "User rejected this action. Do not retry."}]

    try:
        lease = provider_service.execution(principal.uid, provider_id) if provider_id else nullcontext()
        async with lease:
            final_state = await resume_agent(
                interrupt["thread_id"],
                decisions,
                user_id=principal.uid,
                provider_id=provider_id or "",
                model_id=model_id or "",
                provider_definition=definition,
            )
    except Exception as exc:  # no resumable state → 409, never fabricate
        raise HTTPException(status_code=409, detail=f"no resumable state: {exc}") from exc

    response = final_state.get("output", final_state.get("messages", ""))
    if isinstance(response, list) and response:
        last = response[-1]
        response = getattr(last, "content", str(last))
    return {"interrupt": interrupt, "response": str(response)}
