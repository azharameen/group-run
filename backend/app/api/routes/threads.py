"""Thread API — wraps LangGraph thread management as REST endpoints.

Every chat conversation maps to one LangGraph thread (checkpoint).
These endpoints manage threads and wire user messages through the
DeepAgents graph with true astream_events streaming.
"""

import json
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...agent.runner import execute_deep_agent_workflow_streaming
from ...services.thread_manager import (
    create_thread,
    delete_thread,
    get_thread,
    get_thread_messages,
    list_threads,
    touch_thread,
    update_thread,
)

router = APIRouter(prefix="/api/threads", tags=["threads"])


# ── Schemas ────────────────────────────────────────────────────────────────


class CreateThreadRequest(BaseModel):
    title: str = "New Chat"
    work_item_id: Optional[str] = None
    tags: list[str] = []
    agent_names: list[str] = []


class UpdateThreadRequest(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    work_item_id: Optional[str] = None
    tags: Optional[list[str]] = None
    agent_names: Optional[list[str]] = None


class SendMessageRequest(BaseModel):
    text: str
    sender: str = "user"
    idea_id: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("")
async def api_list_threads(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """List threads sorted by updated_at DESC."""
    threads = list_threads(status=status, limit=limit, offset=offset)
    return {"threads": threads, "count": len(threads)}


@router.post("")
async def api_create_thread(req: CreateThreadRequest) -> dict[str, Any]:
    """Create a new thread."""
    thread = create_thread(
        title=req.title,
        work_item_id=req.work_item_id,
        tags=req.tags,
        agent_names=req.agent_names,
    )
    return {"thread": thread}


@router.get("/{thread_id}")
async def api_get_thread(thread_id: str) -> dict[str, Any]:
    """Get thread metadata."""
    thread = get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"thread": thread}


@router.put("/{thread_id}")
async def api_update_thread(
    thread_id: str,
    req: UpdateThreadRequest,
) -> dict[str, Any]:
    """Update thread metadata."""
    updates = {k: v for k, v in req.model_dump(exclude_none=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    thread = update_thread(thread_id, **updates)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"thread": thread}


@router.delete("/{thread_id}")
async def api_delete_thread(thread_id: str) -> dict[str, bool]:
    """Delete a thread."""
    deleted = delete_thread(thread_id)
    return {"deleted": deleted}


@router.get("/{thread_id}/messages")
async def api_get_thread_messages(thread_id: str) -> dict[str, Any]:
    """Retrieve messages from a thread's latest checkpoint state."""
    thread = get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = get_thread_messages(thread_id)
    return {"messages": messages, "count": len(messages)}


@router.post("/{thread_id}/stream")
async def api_stream_message(
    thread_id: str,
    req: SendMessageRequest,
) -> StreamingResponse:
    """Send a message to a thread and stream the agent response.

    Uses LangGraph's astream_events for true event-bound streaming.
    """
    thread = get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Touch updated_at
    touch_thread(thread_id)

    return StreamingResponse(
        _thread_stream_generator(thread_id, req.text, req.idea_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Streaming Generator ────────────────────────────────────────────────────


async def _thread_stream_generator(
    thread_id: str,
    text: str,
    idea_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream agent reasoning and response events for a thread message."""
    async for event in execute_deep_agent_workflow_streaming(
        idea_id or "",
        text,
        thread_id=thread_id,
    ):
        yield f"data: {json.dumps(event)}\n\n"
