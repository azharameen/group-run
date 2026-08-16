"""SSE event bus shared by the API and workflow runtime.

Provides a `StreamBus` singleton that manages per-client asyncio queues and
broadcasts SSE-formatted event strings.  Legacy functions
(`sse_event_generator`, `emit_sse`) delegate to the singleton for backward
compatibility.
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# StreamBus class
# ---------------------------------------------------------------------------

class StreamBus:
    """SSE broadcast bus -- single-threaded (asyncio event loop only).

    All operations run in the asyncio event loop thread, so no locks are
    needed for ``_clients`` list mutations.  If ``publish()`` is ever
    called from a sync background thread, wrap the call in
    ``asyncio.run_coroutine_threadsafe()`` instead.
    """

    _MAX_QUEUE = 256

    def __init__(self) -> None:
        self._clients: list[asyncio.Queue] = []

    async def subscribe(self) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted event strings for one connected client."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._MAX_QUEUE * 2)
        self._clients.append(queue)
        logger.debug("SSE client connected (total: %d)", len(self._clients))
        try:
            while True:
                event: str = await queue.get()
                yield event
        except asyncio.CancelledError:
            pass
        finally:
            try:
                self._clients.remove(queue)
            except ValueError:
                pass
            logger.debug("SSE client disconnected (total: %d)", len(self._clients))

    def publish(self, event_type: str, payload: dict) -> None:
        """Broadcast an event to all connected SSE clients.

        Dead clients (queue depth > ``_MAX_QUEUE``) are evicted before
        publishing.
        """
        # Safely merge payload; explicit event_type always wins
        event_dict: dict = {"type": event_type, **payload}
        if "type" in payload:
            event_dict["type"] = event_type
        try:
            sse_line = f"data: {json.dumps(event_dict)}\n\n"
        except (TypeError, ValueError):
            logger.warning("SSE publish skipped (non-serializable payload): %s", event_type)
            return
        dropped = 0
        # Evict dead clients in-place (O(1) pop at current index)
        i = 0
        while i < len(self._clients):
            if self._clients[i].qsize() > self._MAX_QUEUE:
                self._clients.pop(i)
                dropped += 1
            else:
                i += 1
        for queue in self._clients:
            try:
                queue.put_nowait(sse_line)
            except asyncio.QueueFull:
                dropped += 1
        logger.debug("SSE publish (%d clients, %d dropped): %s", len(self._clients), dropped, event_type)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_bus = StreamBus()


# ---------------------------------------------------------------------------
# Backward-compatible legacy functions
# ---------------------------------------------------------------------------

async def sse_event_generator() -> AsyncGenerator[dict, None]:
    """Legacy wrapper — yields parsed event dicts.

    Delegates to ``StreamBus.subscribe()`` and converts SSE-formatted
    strings back to dicts for callers expecting the original API.
    """
    async for sse_line in _bus.subscribe():
        raw = sse_line[len("data: "):-2]  # strip "data: " prefix and trailing "\n\n"
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        event_type = event.pop("type", "")
        # Extract inner "data" key when present (from emit_sse legacy path)
        data = event.pop("data", event)
        yield {"event": event_type, "data": json.dumps(data)}


def emit_sse(event_type: str, data: dict) -> None:
    """Legacy wrapper — delegates to ``StreamBus.publish()``."""
    _bus.publish(event_type, {"data": data})
