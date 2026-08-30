"""SSE generator for a thread-bound DeepAgents execution."""

import json
import logging
from collections.abc import AsyncGenerator
from contextlib import nullcontext
from typing import Any

from ...providers.service import ProviderConfigService

logger = logging.getLogger(__name__)


async def thread_stream_generator(
    thread_id: str,
    text: str,
    idea_id: str | None = None,
    user_id: str = "",
    provider_id: str | None = None,
    model_id: str | None = None,
    definition: Any = None,
    service: ProviderConfigService | None = None,
) -> AsyncGenerator[str, None]:
    """Stream one resolved provider model through the DeepAgents runtime.

    ``provider_id``/``model_id`` are ``None`` in fallback mode (no per-user
    provider configured, DEEPAGENTS_MODEL set) — the execution lease only
    applies to real provider configurations.
    """
    from ...agent.runner import execute_deep_agent_workflow_streaming

    emitted_done = False
    try:
        provider_service = service or ProviderConfigService()
        lease = provider_service.execution(user_id, provider_id) if provider_id else nullcontext()
        async with lease:
            async for event in execute_deep_agent_workflow_streaming(
                idea_id or "",
                text,
                thread_id,
                user_id=user_id,
                provider_id=provider_id or "",
                model_id=model_id or "",
                provider_definition=definition,
            ):
                emitted_done = emitted_done or event.get("type") == "done"
                yield f"data: {json.dumps(event)}\n\n"
    except Exception as exc:
        logger.exception("Thread stream failed for thread %s", thread_id)
        error = {
            "type": "error",
            "error": {
                "code": "streaming_failure",
                "message": str(exc),
                "retryable": True,
            },
        }
        yield f"data: {json.dumps(error)}\n\n"
    # Yielding inside a finally-block would raise when the client disconnects
    # mid-cleanup (GeneratorExit), so the fallback lives here instead. The
    # runner always emits its own done/failed, so this only covers the case
    # where an error was raised before the runner could emit one.
    if not emitted_done:
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
