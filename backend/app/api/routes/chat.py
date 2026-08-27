"""Chat endpoint — streams supervisor graph state via SSE."""

import json
import logging
from collections.abc import AsyncGenerator
from contextlib import nullcontext

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ...agent.runner import execute_deep_agent_workflow_streaming
from ...auth.middleware import get_request_principal
from ...providers.service import ProviderConfigService
from ...services.thread_manager import create_thread, get_or_claim_thread, update_thread

router = APIRouter(prefix="/api", tags=["chat"])
logger = logging.getLogger(__name__)


class StreamChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    provider_id: str | None = Field(default=None, max_length=64)
    model_id: str | None = Field(default=None, max_length=200)
    thread_id: str | None = Field(default=None, max_length=64)


provider_service = ProviderConfigService()


def _error_shape(error) -> dict:
    """Normalize supervisor error into {code, message, retryable}."""
    if isinstance(error, dict):
        error.setdefault("code", "agent_failure")
        error.setdefault("message", str(error))
        error.setdefault("retryable", False)
        return error
    return {"code": "agent_failure", "message": str(error), "retryable": False}


async def _chat_stream_generator(
    text: str,
    user_id: str,
    provider_id: str | None,
    model_id: str | None,
    definition,
    thread_id: str,
    service: ProviderConfigService,
) -> AsyncGenerator[str, None]:
    """Stream an exact enabled provider/model selection through DeepAgents.

    ``provider_id``/``model_id`` are ``None`` in fallback mode (no per-user
    provider configured, DEEPAGENTS_MODEL set) — the execution lease only
    applies to real provider configurations.
    """
    emitted_done = False

    try:
        lease = service.execution(user_id, provider_id) if provider_id else nullcontext()
        async with lease:
            async for event in execute_deep_agent_workflow_streaming(
                "",
                text,
                thread_id,
                user_id=user_id,
                provider_id=provider_id or "",
                model_id=model_id or "",
                provider_definition=definition,
            ):
                emitted_done = emitted_done or event.get("type") == "done"
                yield f"data: {json.dumps(event)}\n\n"

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
async def stream_chat(req: StreamChatRequest, request: Request) -> StreamingResponse:
    """Stream agent reasoning and response for a user message."""
    principal = get_request_principal(request)
    thread_id = req.thread_id
    if thread_id and not await get_or_claim_thread(thread_id, principal.uid):
        raise HTTPException(status_code=404, detail="Thread not found")
    try:
        provider_id, model_id, definition = await provider_service.resolve_model(
            principal.uid, req.provider_id, req.model_id
        )
    except (LookupError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not thread_id:
        thread_id = (await create_thread(owner_uid=principal.uid))["thread_id"]
    await update_thread(
        thread_id,
        principal.uid,
        provider_id=provider_id,
        model_id=model_id,
    )
    return StreamingResponse(
        _chat_stream_generator(
            req.text,
            principal.uid,
            provider_id,
            model_id,
            definition,
            thread_id,
            provider_service,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
