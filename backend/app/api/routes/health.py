"""Health and basic service endpoints."""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from ...db.session import get_engine

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
        async def check_database() -> None:
            async with get_engine().connect() as connection:
                await connection.execute(text("SELECT 1"))

        await asyncio.wait_for(check_database(), timeout=10)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ready"}
