"""Thread API — wraps LangGraph thread management as REST + streaming endpoints."""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import anyio.to_thread
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ...services.thread_manager import (
    create_thread,
    delete_thread,
    get_thread,
    get_thread_messages,
    list_threads,
    touch_thread,
    update_thread,
)
from ..schemas import CreateThreadRequest, SendMessageRequest, UpdateThreadRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/threads", tags=["threads"])

THREAD_NOT_FOUND = "Thread not found"
NO_FIELDS_TO_UPDATE = "No fields to update"


@router.get("")
def api_list_threads(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """List threads sorted by updated_at DESC."""
    threads = list_threads(status=status, limit=limit, offset=offset)
    return {"threads": threads, "count": len(threads)}


@router.post("")
def api_create_thread(req: CreateThreadRequest) -> dict[str, Any]:
    """Create a new thread."""
    thread = create_thread(
        title=req.title,
        idea_id=req.idea_id,
        tags=req.tags,
        agent_names=req.agent_names,
    )
    return {"thread": thread}


@router.get("/{thread_id}", responses={404: {"description": THREAD_NOT_FOUND}})
def api_get_thread(thread_id: str) -> dict[str, Any]:
    """Get thread metadata."""
    thread = get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    return {"thread": thread}


@router.put("/{thread_id}")
@router.patch("/{thread_id}")
def api_update_thread(
    thread_id: str,
    req: UpdateThreadRequest,
) -> dict[str, Any]:
    """Update thread metadata (supports both PUT and PATCH)."""
    updates = {k: v for k, v in req.model_dump(exclude_none=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail=NO_FIELDS_TO_UPDATE)
    thread = update_thread(thread_id, **updates)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    return {"thread": thread}


@router.delete("/{thread_id}")
def api_delete_thread(thread_id: str) -> dict[str, bool]:
    """Delete a thread."""
    deleted = delete_thread(thread_id)
    return {"deleted": deleted}


@router.get("/{thread_id}/messages")
async def api_get_thread_messages(thread_id: str) -> dict[str, Any]:
    """Retrieve messages from a thread's latest checkpoint state."""
    thread = await anyio.to_thread.run_sync(get_thread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    messages = await get_thread_messages(thread_id)
    return {"messages": messages, "count": len(messages)}


@router.post("/{thread_id}/stream")
async def api_stream_message(
    thread_id: str,
    req: SendMessageRequest,
) -> StreamingResponse:
    """Send a message to a thread and stream the agent response."""
    thread = await anyio.to_thread.run_sync(get_thread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=THREAD_NOT_FOUND)
    await anyio.to_thread.run_sync(touch_thread, thread_id)
    return StreamingResponse(
        _thread_stream_generator(thread_id, req.text, req.idea_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Streaming Generator ────────────────────────────────────────────────────


async def _thread_stream_generator(
    thread_id: str,
    text: str,
    idea_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream agent response events for a thread message via ainvoke + checkpointing."""
    from langchain_core.messages import HumanMessage

    from ...orchestrator.supervisor import get_supervisor_graph

    emitted_done = False
    supervisor = get_supervisor_graph()
    try:
        final_state = await supervisor.ainvoke(
            input={"messages": [HumanMessage(content=text)]},
            config={"configurable": {"thread_id": thread_id}},
        )
        response = final_state.get("response")
        error = final_state.get("error")
        if final_state.get("waiting_for_approval"):
            ev = {'type': 'interrupt', 'interrupt': None, 'error': None, 'routing_key': final_state.get('routing_key', 'general')}
            yield f"data: {json.dumps(ev)}\n\n"
            emitted_done = True
        elif error:
            err = {'type': 'error', 'error': {'code': 'agent_failure', 'message': str(error) if not isinstance(error, dict) else error.get('message', str(error)), 'retryable': isinstance(error, dict) and error.get('retryable', False)}}
            yield f"data: {json.dumps(err)}\n\n"
            emitted_done = True
        elif response:
            ev = {'type': 'state_update', 'response': str(response), 'error': None, 'routing_key': final_state.get('routing_key', 'general')}
            yield f"data: {json.dumps(ev)}\n\n"
            emitted_done = True
        else:
            logger.warning("Agent returned empty response for thread %s", thread_id)
    except Exception as exc:
        logger.exception("Thread stream failed for thread %s", thread_id)
        yield f"data: {json.dumps({'type': 'error', 'error': {'code': 'streaming_failure', 'message': str(exc), 'retryable': True}})}\n\n"
    finally:
        if not emitted_done:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
