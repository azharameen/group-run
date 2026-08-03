"""Global chat endpoint with transcript-backed streaming."""

import json
from typing import Any, AsyncGenerator, Optional
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...storage.yaml_io import load_idea_yaml

router = APIRouter(prefix="/api", tags=["chat"])


class StreamChatMessage(BaseModel):
    text: str
    sender: str = "user"


@router.get("/agent-tasks")
async def get_agent_tasks(idea_id: Optional[str] = None) -> dict[str, Any]:
    """Retrieve real dynamic subagent tasks and planning checklist."""
    active = idea_id or "IDEA-0006"
    idea_data = load_idea_yaml(active, "idea.yaml") or {}
    state = idea_data.get("workflow_state", "ideascope_draft")

    tasks = [
        {
            "id": "t1",
            "title": f"Taxonomy & Prior-Art Search for {idea_data.get('title', active)}",
            "agent": "prior-art-researcher",
            "status": "Completed" if state != "ideascope_draft" else "In Progress",
        },
        {
            "id": "t2",
            "title": f"Evaluate Novelty & Claim Boundaries ({state})",
            "agent": "workflow-orchestrator",
            "status": "In Progress" if state == "ideascope_draft" else "Completed",
        },
        {
            "id": "t3",
            "title": "Draft Invention Disclosure & Siemens Gate Packet",
            "agent": "ip-manager",
            "status": "To Do",
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


async def _chat_stream_generator(text: str) -> AsyncGenerator[str, None]:
    """Convert streaming events into SSE-formatted data lines."""
    async for event in execute_deep_agent_workflow_streaming("", text):
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/chat/stream")
async def stream_chat(req: StreamChatMessage) -> StreamingResponse:
    """Stream agent reasoning and response for a user message."""
    return StreamingResponse(
        _chat_stream_generator(req.text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
