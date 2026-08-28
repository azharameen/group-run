"""Thread API — wraps LangGraph thread management as REST + streaming endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query, Request
from fastapi.responses import StreamingResponse

from ...auth.middleware import get_request_principal
from ...providers.service import ProviderConfigService
from ...services.thread_manager import (
    create_thread,
    delete_thread,
    get_or_claim_thread,
    get_thread_messages,
    list_threads,
    touch_thread,
    update_thread,
)
from ..schemas import CreateThreadRequest, SendMessageRequest, UpdateThreadRequest
from .thread_stream import thread_stream_generator

router = APIRouter(prefix="/api/threads", tags=["threads"])
provider_service = ProviderConfigService()

THREAD_NOT_FOUND = "Thread not found"
NO_FIELDS_TO_UPDATE = "No fields to update"


@router.get("")
async def api_list_threads(
    request: Request,
    status: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """List threads sorted by updated_at DESC."""
    threads = await list_threads(
        status=status, limit=limit, offset=offset, owner_uid=get_request_principal(request).uid
    )
    return {"threads": threads, "count": len(threads)}


@router.post("")
async def api_create_thread(req: CreateThreadRequest, request: Request) -> dict[str, Any]:
    """Create a new thread."""
    thread = await create_thread(
        title=req.title,
        idea_id=req.idea_id,
        tags=req.tags,
        agent_names=req.agent_names,
        owner_uid=get_request_principal(request).uid,
    )
    return {"thread": thread}


@router.get("/{thread_id}", responses={404: {"description": THREAD_NOT_FOUND}})
async def api_get_thread(
    request: Request, thread_id: str = Path(..., max_length=64)
) -> dict[str, Any]:
    """Get thread metadata."""
    thread = await get_or_claim_thread(thread_id, get_request_principal(request).uid)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    return {"thread": thread}


@router.put("/{thread_id}")
@router.patch("/{thread_id}")
async def api_update_thread(
    req: UpdateThreadRequest,
    request: Request,
    thread_id: str = Path(..., max_length=64),
) -> dict[str, Any]:
    """Update thread metadata (supports both PUT and PATCH)."""
    updates = {k: v for k, v in req.model_dump(exclude_none=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail=NO_FIELDS_TO_UPDATE)
    principal = get_request_principal(request)
    if not await get_or_claim_thread(thread_id, principal.uid):
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    thread = await update_thread(thread_id, principal.uid, **updates)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    return {"thread": thread}


@router.delete("/{thread_id}")
async def api_delete_thread(
    request: Request, thread_id: str = Path(..., max_length=64)
) -> dict[str, bool]:
    """Delete a thread."""
    principal = get_request_principal(request)
    if not await get_or_claim_thread(thread_id, principal.uid):
        return {"deleted": False}
    deleted = await delete_thread(thread_id, principal.uid)
    return {"deleted": deleted}


@router.get("/{thread_id}/messages")
async def api_get_thread_messages(
    request: Request, thread_id: str = Path(..., max_length=64)
) -> dict[str, Any]:
    """Retrieve messages from a thread's latest checkpoint state."""
    thread = await get_or_claim_thread(thread_id, get_request_principal(request).uid)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    messages = await get_thread_messages(thread_id)
    return {"messages": messages, "count": len(messages)}


@router.post("/{thread_id}/stream")
async def api_stream_message(
    req: SendMessageRequest,
    request: Request,
    thread_id: str = Path(..., max_length=64),
) -> StreamingResponse:
    """Send a message to a thread and stream the agent response."""
    principal = get_request_principal(request)
    thread = await get_or_claim_thread(thread_id, principal.uid)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    try:
        selected_provider_id = req.provider_id
        selected_model_id = req.model_id
        if not selected_provider_id and not selected_model_id:
            selected_provider_id = thread.get("provider_id")
            selected_model_id = thread.get("model_id")
        provider_id, model_id, definition = await provider_service.resolve_model(
            principal.uid, selected_provider_id, selected_model_id
        )
    except (LookupError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await update_thread(
        thread_id,
        principal.uid,
        provider_id=provider_id,
        model_id=model_id,
    )
    await touch_thread(thread_id, principal.uid)
    return StreamingResponse(
        thread_stream_generator(
            thread_id,
            req.text,
            req.idea_id,
            principal.uid,
            provider_id,
            model_id,
            definition,
            provider_service,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
