"""Health and basic service endpoints."""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from ...services.thread_manager import get_pg_checkpointer

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "timestamp": datetime.now(UTC).isoformat(),
        "version": "1.0.0",
    }


@router.get("/ready")
async def readiness() -> dict[str, str]:
    """Verify dependencies required to serve agent requests."""
    try:
        await asyncio.wait_for(get_pg_checkpointer(), timeout=10)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ready"}
