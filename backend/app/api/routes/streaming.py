"""Streaming endpoints."""

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from ...infrastructure.events.stream_bus import sse_event_generator


router = APIRouter(prefix="/api", tags=["streaming"])


@router.get("/sse")
async def sse_stream(_request: Request) -> EventSourceResponse:
    """Dashboard clients connect here for live updates."""
    return EventSourceResponse(sse_event_generator())
