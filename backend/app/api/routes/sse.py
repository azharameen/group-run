"""SSE endpoint for StreamBus consumers."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.infrastructure.events.stream_bus import _bus

router = APIRouter(prefix="/api", tags=["sse"])


@router.get("/sse")
async def sse() -> StreamingResponse:
    return StreamingResponse(_bus.subscribe(), media_type="text/event-stream")
