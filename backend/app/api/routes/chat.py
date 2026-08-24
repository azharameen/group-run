"""Chat endpoint — streams supervisor graph state via SSE."""

import json
import logging
from collections.abc import AsyncGenerator
from uuid import uuid4

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from ...orchestrator.supervisor import get_supervisor_graph

router = APIRouter(prefix="/api", tags=["chat"])
logger = logging.getLogger(__name__)


class StreamChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)


def _error_shape(error) -> dict:
    """Normalize supervisor error into {code, message, retryable}."""
    if isinstance(error, dict):
        error.setdefault("code", "agent_failure")
        error.setdefault("message", str(error))
        error.setdefault("retryable", False)
        return error
    return {"code": "agent_failure", "message": str(error), "retryable": False}


async def _chat_stream_generator(text: str) -> AsyncGenerator[str, None]:
    """Invoke the supervisor graph via astream v2 and emit SSE events."""
    thread_id = str(uuid4())
    emitted_done = False

    try:
        supervisor = await get_supervisor_graph()
        async for state in supervisor.astream(
            input={"messages": [HumanMessage(content=text)]},
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="values",
            version="v2",
        ):
            response = state.get("response")
            error = state.get("error")

            if error:
                event = {
                    "type": "error",
                    "error": _error_shape(error),
                    "routing_key": state.get("routing_key", "general"),
                }
            else:
                # Skip meaningless intermediate state (no response, no error)
                if not response and not error:
                    continue
                event = {
                    "type": "state_update",
                    "response": response or "",
                    "error": None,
                    "routing_key": state.get("routing_key", "general"),
                }

            yield f"data: {json.dumps(event)}\n\n"

            if response or error:
                emitted_done = True
                break

    except Exception as exc:  # noqa: BLE001  # stream contract: always emit an error event, never crash the SSE
        logger.error("Chat stream failed: %s", exc)
        error_event = {
            "type": "error",
            "error": {
                "code": "streaming_failure",
                "message": "An error occurred while processing your request. Please try again.",
                "retryable": True,
            },
            "routing_key": "general",
        }
        yield f"data: {json.dumps(error_event)}\n\n"

    finally:
        if not emitted_done:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/chat/stream")
async def stream_chat(req: StreamChatRequest) -> StreamingResponse:
    """Stream agent reasoning and response for a user message."""
    return StreamingResponse(
        _chat_stream_generator(req.text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
