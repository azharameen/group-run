"""FastAPI app factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..infrastructure.events.stream_bus import emit_sse
from ..infrastructure.observability import configure_langsmith_tracing
from ..orchestrator.workflow_tools import set_emit_sse_callback as tools_set_emit
from ..orchestrator.workflow import set_emit_sse_callback as workflow_set_emit
from ..scheduler import start_scheduler, stop_scheduler
from ..state.machine import set_emit_sse_callback as state_set_emit
from ..storage.yaml_io import load_idea_registry, recover_from_filesystem
from .routes.approval import router as approval_router
from .routes.chat import router as chat_router
from .routes.config import router as config_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router
from .routes.streaming import router as streaming_router
from .routes.workflow import router as workflow_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()
    tools_set_emit(emit_sse)
    workflow_set_emit(emit_sse)
    state_set_emit(emit_sse)

    recovered = recover_from_filesystem()
    if recovered > 0:
        print(f"[Startup] Recovered {recovered} idea(s) from filesystem")

    registry = load_idea_registry()
    for entry in registry.get("ideas", []):
        idea_id = entry["idea_id"]
        try:
            from ..orchestrator.workflow_tools import get_machine

            get_machine(idea_id)
        except Exception as exc:
            print(f"[Startup] Warning: could not load machine for {idea_id}: {exc}")

    start_scheduler()
    yield
    stop_scheduler()


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

    app.include_router(health_router)
    app.include_router(streaming_router)
    app.include_router(ideas_router)
    app.include_router(workflow_router)
    app.include_router(config_router)
    app.include_router(approval_router)
    app.include_router(chat_router)
    from .routes.threads import router as threads_router

    app.include_router(threads_router)
    return app
