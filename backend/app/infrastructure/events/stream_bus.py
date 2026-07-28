"""SSE event bus shared by the API and workflow runtime."""

import asyncio
import json
from typing import AsyncGenerator


_sse_clients: list[asyncio.Queue] = []


async def sse_event_generator() -> AsyncGenerator[dict, None]:
    """Yield server-sent events for one connected client."""
    queue: asyncio.Queue = asyncio.Queue()
    _sse_clients.append(queue)
    try:
        while True:
            event = await queue.get()
            yield {
                "event": event["type"],
                "data": json.dumps(event["data"]),
            }
    except asyncio.CancelledError:
        pass
    finally:
        _sse_clients.remove(queue)


def emit_sse(event_type: str, data: dict) -> None:
    """Push an event to all connected SSE clients."""
    dead = [queue for queue in _sse_clients if not queue.empty() and queue.qsize() > 100]
    for queue in dead:
        try:
            _sse_clients.remove(queue)
        except ValueError:
            pass

    for queue in _sse_clients:
        try:
            queue.put_nowait({"type": event_type, "data": data})
        except asyncio.QueueFull:
            pass
