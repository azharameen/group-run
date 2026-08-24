"""Testing support API routes — test data isolation and environment resets."""

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, status
from sqlalchemy import text

from ...config import WORKSPACE_DIR
from ...db.session import get_session_factory
from ...orchestrator import supervisor as _sup
from ...storage.registry import save_idea_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/testing", tags=["testing"])


@router.post("/reset", status_code=status.HTTP_200_OK)
async def reset_test_state() -> dict[str, str]:
    """Reset application state to clean baseline for E2E test isolation."""
    # 1. Reset all PostgreSQL tables
    tables = [
        "interrupts",
        "thread_metadata",
        "checkpoints",
        "checkpoint_blobs",
        "checkpoint_writes",
        "accuracy_reviews",
        "workflow_templates",
        "org_alerts",
        "decisions",
        "lifecycle_events",
        "routing_decisions",
        "work_items",
        "agents",
        "teams",
        "departments",
        "organizations",
    ]
    try:
        async with get_session_factory()() as session:
            for table in tables:
                try:
                    await session.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
                except Exception:  # noqa: BLE001, S110
                    # Table might not exist yet if checkpointer hasn't initialized
                    pass
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error truncating PostgreSQL tables: %s", exc)

    # 2. Reset idea registry and remove workspace/ideas subdirectories
    try:
        save_idea_registry({"ideas": [], "next_id": 1})
        ideas_dir = Path(WORKSPACE_DIR) / "ideas"
        if ideas_dir.exists():
            for item in ideas_dir.iterdir():
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                else:
                    item.unlink(missing_ok=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error resetting idea registry/workspace: %s", exc)

    # 3. Reset supervisor graph cache
    _sup._graph = None

    # 4. Clear connected SSE clients to avoid cross-test event pollution
    from app.infrastructure.events.stream_bus import _bus
    _bus._clients.clear()

    return {"status": "ok", "message": "Test state reset successfully"}
