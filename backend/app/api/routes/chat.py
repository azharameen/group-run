"""Global and idea-scoped chat endpoints with transcript-backed streaming."""

import json
from datetime import datetime
from typing import Any, AsyncGenerator, List, Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...storage.yaml_io import (
    load_comments,
    load_idea_yaml,
    load_transcript_events,
    save_comment,
    save_idea_yaml,
    save_transcript_event,
)
from ...agent.runner import execute_deep_agent_workflow_streaming
from ...orchestrator.workflow import get_active_idea

router = APIRouter(prefix="/api", tags=["chat"])


class ChatMessage(BaseModel):
    idea_id: Optional[str] = ""
    sender: str = "user"  # "user" or agent name
    text: str
    timestamp: str = ""


def _transcript_to_message(event: dict[str, Any]) -> dict[str, Any]:
    text = event.get("content") or event.get("reason") or event.get("output") or ""
    if not text and event.get("type") == "handover":
        text = f"{event.get('from_agent', 'Orchestrator')} handed off to {event.get('to_agent', 'Subagent')}"
    return {
        "id": event.get("id"),
        "sender": event.get("speaker") or event.get("agent") or "Runtime",
        "speaker": event.get("speaker") or event.get("agent"),
        "role": event.get("role"),
        "text": text if isinstance(text, str) else str(text),
        "timestamp": event.get("timestamp", ""),
        "event_type": event.get("type"),
        "provenance": event.get("provenance"),
    }


@router.get("/agent-tasks")
async def get_agent_tasks(idea_id: Optional[str] = None) -> dict[str, Any]:
    """Retrieve real dynamic subagent tasks and planning checklist."""
    active = idea_id or get_active_idea() or "IDEA-0006"
    idea_data = load_idea_yaml(active, "idea.yaml") or {}
    state = idea_data.get("workflow_state", "ideascope_draft")

    tasks = [
        {
            "id": "t1",
            "title": f"Taxonomy & Prior-Art Search for {idea_data.get('title', active)}",
            "agent": "prior-art-researcher",
            "status": "Completed" if state != "ideascope_draft" else "In Progress",
            "thought": "Transcript records prior-art tool calls.",
        },
        {
            "id": "t2",
            "title": f"Evaluate Novelty & Claim Boundaries ({state})",
            "agent": "workflow-orchestrator",
            "status": "In Progress" if state == "ideascope_draft" else "Completed",
            "thought": "Transcript records orchestrator and subagent turns.",
        },
        {
            "id": "t3",
            "title": "Draft Invention Disclosure & Siemens Gate Packet",
            "agent": "ip-manager",
            "status": "To Do",
            "thought": "Transcript will surface approval and completion events here.",
        },
    ]

    completed_count = sum(1 for t in tasks if t["status"] == "Completed")
    return {
        "idea_id": active,
        "tasks": tasks,
        "completed": completed_count,
        "total": len(tasks),
        "completion_pct": int((completed_count / len(tasks)) * 100),
    }


@router.get("/chat")
@router.get("/ideas/{idea_id}/chat")
async def get_chat_history(idea_id: Optional[str] = None) -> dict[str, Any]:
    """Retrieve chat history across global workspace or a specific idea."""
    if idea_id:
        idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
        transcript_events = load_transcript_events(idea_id)
        comments = load_comments(idea_id) or []

        messages: List[dict[str, Any]] = []
        if transcript_events:
            for event in transcript_events:
                messages.append(_transcript_to_message(event))
        else:
            for c in comments:
                messages.append({
                    "id": c.get("comment_id", f"c_{len(messages)+1}"),
                    "sender": c.get("author", "user"),
                    "text": c.get("text", ""),
                    "timestamp": c.get("created_at", "12:00"),
                })
            
        return {
            "idea_id": idea_id,
            "messages": messages,
            "transcript_events": transcript_events,
            "count": len(messages),
        }

    return {
        "idea_id": "global",
        "messages": [],
        "transcript_events": [],
        "count": 0,
    }


@router.post("/chat")
@router.post("/ideas/{idea_id}/chat")
async def post_chat_message(req: ChatMessage, idea_id: Optional[str] = None) -> dict[str, Any]:
    """Persist a user message and record it in transcript history."""
    target_idea = req.idea_id or idea_id or ""

    if target_idea:
        idea_data = load_idea_yaml(target_idea, "idea.yaml")
        if not idea_data:
            raise HTTPException(status_code=404, detail=f"Idea '{target_idea}' not found")

        save_comment(target_idea, text=req.text, author=req.sender)
        save_transcript_event(target_idea, {
            "type": "user_message",
            "speaker": req.sender,
            "role": "user",
            "content": req.text,
            "provenance": f"chat:{target_idea}",
        })

        save_idea_yaml(target_idea, "idea.yaml", idea_data)

        return {
            "success": True,
            "idea_id": target_idea,
            "user_message": req.text,
            "transcript_event": {
                "speaker": req.sender,
                "role": "user",
                "content": req.text,
            },
            "active_agent": idea_data.get("active_agent") or idea_data.get("running_agent") or "Workflow Orchestrator",
            "transcript_events": load_transcript_events(target_idea),
        }

    return {
        "success": True,
        "idea_id": "global",
        "user_message": req.text,
        "active_agent": "Workflow Orchestrator",
        "transcript_events": [],
    }


# ── Streaming Chat Endpoints ──────────────────────────────────────────────────

class StreamChatMessage(BaseModel):
    text: str
    sender: str = "user"


async def _chat_stream_generator(idea_id: Optional[str], text: str) -> AsyncGenerator[str, None]:
    """Convert streaming events into SSE-formatted data lines."""
    async for event in execute_deep_agent_workflow_streaming(idea_id or "", text):
        if idea_id and event.get("type") != "done":
            save_transcript_event(idea_id, event)
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/ideas/{idea_id}/chat/stream")
async def stream_idea_chat(idea_id: str, req: StreamChatMessage) -> StreamingResponse:
    """Stream real-time agent reasoning, tool calls, subagent spawns and response tokens."""
    return StreamingResponse(
        _chat_stream_generator(idea_id, req.text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/stream")
async def stream_global_chat(req: StreamChatMessage) -> StreamingResponse:
    """Stream real-time agent reasoning for the global workspace."""
    return StreamingResponse(
        _chat_stream_generator(None, req.text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
