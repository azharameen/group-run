"""Interrupt management endpoints."""

from fastapi import APIRouter, HTTPException, status

from ...api.schemas import CreateInterruptRequest, InterruptDecisionRequest, InterruptResponse
from ...services.interrupt_service import InterruptDeliveryError, InterruptService

router = APIRouter(prefix="/api/interrupts", tags=["interrupts"])


@router.get("/pending")
def list_pending() -> dict[str, list[dict]]:
    return {"interrupts": InterruptService.instance().list_pending()}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_interrupt(payload: CreateInterruptRequest) -> InterruptResponse:
    try:
        interrupt = InterruptService.instance().create_interrupt(
            payload.thread_id, payload.tool_name, payload.message, payload.tool_input
        )
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.patch("/{interrupt_id}/approve")
def approve_interrupt(interrupt_id: str, payload: InterruptDecisionRequest) -> InterruptResponse:
    try:
        interrupt = InterruptService.instance().approve_interrupt(interrupt_id, payload.decision, payload.reason)
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
        interrupt = InterruptService.instance().reject_interrupt(interrupt_id, payload.reason)
        if interrupt is None:
            existing = InterruptService.instance().get_interrupt(interrupt_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Interrupt not found")
            raise HTTPException(status_code=409, detail="Interrupt already resolved")
        return InterruptResponse(interrupt=interrupt)
    except InterruptDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
