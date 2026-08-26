import asyncio
import logging
import subprocess
import sys
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from time import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from ..config import settings
from ..infrastructure.observability import configure_langsmith_tracing
from ..services.thread_manager import close_pg_checkpointer, reset_pg_checkpointer
from .routes.artifacts import router as artifacts_router
from .routes.chat import router as chat_router
from .routes.config import router as config_router
from .routes.decisions import router as decisions_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router
from .routes.interrupts import router as interrupts_router
from .routes.knowledge_base import router as knowledge_base_router
from .routes.maturity import router as maturity_router
from .routes.mcp import router as mcp_router
from .routes.organizations import router as organizations_router
from .routes.providers import router as providers_router
from .routes.reviews import router as reviews_router
from .routes.sse import router as sse_router
from .routes.testing import router as testing_router
from .routes.threads import router as threads_router
from .routes.work_item_templates import router as work_item_templates_router
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


def _run_alembic_upgrade() -> None:
    """Run 'alembic upgrade head' as a subprocess.

    Called at startup when DB_AUTO_MIGRATE=true (local dev / docker-compose).
    Production deployments use the CI/CD db-migrate.yml reusable workflow instead.
    """
    import os
    from pathlib import Path

    # Resolve the backend directory (contains alembic.ini)
    backend_dir = Path(__file__).resolve().parent.parent.parent
    alembic_ini = backend_dir / "alembic.ini"
    if not alembic_ini.exists():
        logger.warning(
            "[Startup] alembic.ini not found at %s — skipping auto-migrate", alembic_ini
        )
        return

    env = {**os.environ, "DATABASE_DIRECT_URL": settings.database_direct_url}
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(backend_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if result.returncode != 0:
            logger.error(
                "[Startup] Alembic upgrade failed:\n%s\n%s",
                result.stdout,
                result.stderr,
            )
            raise RuntimeError(f"Alembic upgrade head failed: {result.stderr}")
        logger.info("[Startup] Alembic upgrade head completed:\n%s", result.stdout.strip())
    except subprocess.TimeoutExpired:
        raise RuntimeError("Alembic upgrade head timed out after 60 seconds")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()

    # 1. Run database schema migrations asynchronously in thread pool (dev mode only)
    if settings.db_auto_migrate:
        logger.info("[Startup] DB_AUTO_MIGRATE=true — running Alembic upgrade head...")
        await asyncio.to_thread(_run_alembic_upgrade)

    # 2. Initialize the PostgreSQL async engine (creates the connection pool)
    from ..db.session import dispose_engine, get_engine, reset_engine
    get_engine()
    logger.info("[Startup] PostgreSQL engine initialized")
    try:
        from .routes.providers import service as provider_service
        await provider_service.refresh_runtime()
    except Exception:
        logger.warning("[Startup] Could not load active provider configuration", exc_info=True)

    # Checkpointer initialization is lazy so Cloud Run can bind its port even
    # when an external database is temporarily unavailable. The readiness
    # endpoint and request path still surface database failures explicitly.
    logger.info("[Startup] PostgreSQL checkpointer will initialize on demand")

    yield

    # ── Graceful shutdown ──────────────────────────────────────────────
    logger.info("[Shutdown] Disposing PostgreSQL connections...")
    await close_pg_checkpointer()
    await dispose_engine()
    logger.info("[Shutdown] PostgreSQL connection pool closed")

    # Reset singletons so re-initialization creates fresh connections
    reset_engine()
    reset_pg_checkpointer()

    # Reset supervisor graph cache so it rebuilds with fresh checkpointer
    from ..orchestrator import supervisor as _sup
    _sup._graph = None
    _sup._agent = None

    from ..services.interrupt_service import InterruptService
    InterruptService._instance = None


def create_app() -> FastAPI:
    app = FastAPI(
        title="Agentic Organization Platform",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https://azharameen\.github\.io|http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Timing middleware — adds X-Process-Time header to non-streaming responses
    app.add_middleware(TimingMiddleware)

    @app.middleware("http")
    async def capture_unhandled_exceptions(request: Request, call_next):
        request_id = uuid.uuid4().hex
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled request exception request_id=%s method=%s path=%s",
                request_id,
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "request_id": request_id,
                },
                headers={"X-Request-ID": request_id},
            )

        if response.status_code >= 500:
            logger.error(
                "Request returned server error request_id=%s method=%s path=%s status=%s",
                request_id,
                request.method,
                request.url.path,
                response.status_code,
            )
        response.headers["X-Request-ID"] = request_id
        return response

    app.include_router(health_router)
    # Idea maturity routes extend the /ideas API surface (story 10.4).
    app.include_router(maturity_router)
    app.include_router(ideas_router)
    app.include_router(knowledge_base_router)
    app.include_router(chat_router)
    app.include_router(interrupts_router)
    app.include_router(mcp_router)
    app.include_router(organizations_router)
    app.include_router(providers_router)
    app.include_router(decisions_router)
    app.include_router(artifacts_router)
    app.include_router(work_item_templates_router)
    app.include_router(work_items_router)
    app.include_router(reviews_router)
    app.include_router(config_router)
    app.include_router(sse_router)
    app.include_router(threads_router)
    app.include_router(testing_router)

    return app
