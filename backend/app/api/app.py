"""FastAPI app factory."""

import logging
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from time import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..infrastructure.observability import configure_langsmith_tracing
from ..services.thread_manager import get_checkpointer
from .routes.chat import router as chat_router
from .routes.config import router as config_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router
from .routes.interrupts import router as interrupts_router
from .routes.knowledge_base import router as knowledge_base_router
from .routes.mcp import router as mcp_router
from .routes.organizations import router as organizations_router
from .routes.sse import router as sse_router
from .routes.testing import router as testing_router
from .routes.threads import router as threads_router
from .routes.work_items import router as work_items_router

logger = logging.getLogger(__name__)


class TimingMiddleware(BaseHTTPMiddleware):
    """Measure request latency and attach ``X-Process-Time`` header.

    Skips SSE endpoints (``/api/sse``) because streaming responses
    would keep the middleware blocked until the client disconnects.
    Logs duration at debug level for observability.
    """

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:  # type: ignore[override]
        # Skip streaming endpoints — timing would block until client disconnects
        if request.url.path in ("/api/sse", "/api/chat/stream"):
            return await call_next(request)

        start_time = time()
        response: Response = await call_next(request)
        duration_ms = (time() - start_time) * 1000
        response.headers["X-Process-Time"] = f"{duration_ms:.2f}"
        logger.debug(
            "Request %s %s completed in %.2fms (status=%s)",
            request.method,
            request.url.path,
            duration_ms,
            response.status_code,
        )
        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()

    checkpointer = get_checkpointer()
    print(f"[Startup] Checkpointer initialized at {checkpointer.conn}")

    # Initialize async checkpointer for astream() compatibility
    from ..services.thread_manager import create_async_checkpointer
    await create_async_checkpointer()
    print("[Startup] Async checkpointer initialized")

    yield

    # Shutdown: close database connections to release file handles
    print("[Shutdown] Closing database connections...")
    from ..services import thread_manager as _tm
    async_cp = _tm._ASYNC_SQLITE_SAVER
    if async_cp is not None and async_cp.conn is not None:
        try:
            await async_cp.conn.close()
            print("[Shutdown] Async checkpointer closed")
        except Exception as exc:  # noqa: BLE001  # best-effort shutdown; never block teardown
            print(f"[Shutdown] Async checkpointer close error: {exc}")

    try:
        # Close sync checkpointer connection
        if hasattr(checkpointer, "conn") and checkpointer.conn is not None:
            checkpointer.conn.close()
            print("[Shutdown] Sync checkpointer closed")
    except Exception as exc:  # noqa: BLE001  # best-effort shutdown; never block teardown
        print(f"[Shutdown] Sync checkpointer close error: {exc}")

    # Reset singleton references so re-initialization creates fresh connections
    # (important for hot-reload and test environments)
    _tm._SQLITE_SAVER = None
    _tm._ASYNC_SQLITE_SAVER = None
    _tm._METADATA_CONN = None
    _tm._THREAD_DB_PATH = None

    # Reset supervisor graph cache so it rebuilds with fresh checkpointer
    from ..orchestrator import supervisor as _sup
    _sup._graph = None


def create_app() -> FastAPI:
    app = FastAPI(
        title="Agentic Organization Platform",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Timing middleware — adds X-Process-Time header to non-streaming responses
    app.add_middleware(TimingMiddleware)

    app.include_router(health_router)
    app.include_router(ideas_router)
    app.include_router(knowledge_base_router)
    app.include_router(chat_router)
    app.include_router(interrupts_router)
    app.include_router(mcp_router)
    app.include_router(organizations_router)
    app.include_router(work_items_router)
    app.include_router(config_router)
    app.include_router(sse_router)
    app.include_router(threads_router)
    app.include_router(testing_router)

    return app
