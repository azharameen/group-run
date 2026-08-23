"""Testing support API routes — test data isolation and environment resets."""

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, status

from ...config import WORKSPACE_DIR
from ...orchestrator import supervisor as _sup
from ...services.interrupt_service import InterruptService
from ...services.thread_manager import get_checkpointer
from ...storage.registry import save_idea_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/testing", tags=["testing"])


@router.post("/reset", status_code=status.HTTP_200_OK)
def reset_test_state() -> dict[str, str]:
    """Reset application state to clean baseline for E2E test isolation.

    Clears:
    - Thread metadata and LangGraph checkpointer tables (threads, checkpoints, writes, blobs)
    - Interrupts table in SQLite
    - Idea registry (ideas.yaml) and idea workspace directories
    - Supervisor graph singleton cache
    """
    # 1. Reset threads & LangGraph checkpoints
    try:
        conn = get_checkpointer().conn
        # Find all tables in checkpointer database
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        for table in tables:
            if not table.startswith("sqlite_"):
                conn.execute(f"DELETE FROM {table}")
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error clearing thread checkpointer tables: %s", exc)

    # 2. Reset interrupts table
    try:
        iconn = InterruptService.instance()._conn()
        iconn.execute("DELETE FROM interrupts")
        iconn.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error clearing interrupts table: %s", exc)

    # 3. Reset idea registry and remove workspace/ideas subdirectories
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

    # 4. Reset supervisor graph cache
    _sup._graph = None

    # 5. Clear connected SSE clients to avoid cross-test event pollution
    from app.infrastructure.events.stream_bus import _bus
    _bus._clients.clear()

    # 6. Reset organization DB tables
    try:
        from app.organization import repository as org_repo
        conn = org_repo._get_conn()
        for table in ("agents", "teams", "departments", "organizations"):
            conn.execute(f"DELETE FROM {table}")
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error resetting organization tables: %s", exc)

    # 7. Reset work items DB tables
    try:
        from app.work_items import repository as work_items_repo
        wconn = work_items_repo._get_conn()
        for table in ("lifecycle_events", "routing_decisions", "work_items", "decisions", "workflow_templates"):
            wconn.execute(f"DELETE FROM {table}")
        wconn.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error resetting work items tables: %s", exc)

    return {"status": "ok", "message": "Test state reset successfully"}
