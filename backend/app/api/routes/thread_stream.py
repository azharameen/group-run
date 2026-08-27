"""SSE generator for a thread-bound DeepAgents execution."""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from ...providers.service import ProviderConfigService

logger = logging.getLogger(__name__)


async def thread_stream_generator(
    thread_id: str,
    text: str,
    idea_id: str | None = None,
    user_id: str = "",
    provider_id: str = "",
    model_id: str = "",
    definition: Any = None,
    service: ProviderConfigService | None = None,
) -> AsyncGenerator[str, None]:
    """Stream one resolved provider model through the DeepAgents runtime."""
    from ...agent.runner import execute_deep_agent_workflow_streaming

    emitted_done = False
    try:
        async with (service or ProviderConfigService()).execution(user_id, provider_id):
            async for event in execute_deep_agent_workflow_streaming(
                idea_id or "",
                text,
                thread_id,
                user_id=user_id,
                provider_id=provider_id,
                model_id=model_id,
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
    finally:
        if not emitted_done:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
