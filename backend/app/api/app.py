"""FastAPI app factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..infrastructure.observability import configure_langsmith_tracing
from ..services.thread_manager import get_checkpointer, get_async_checkpointer
from .routes.chat import router as chat_router
from .routes.interrupts import router as interrupts_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router
from .routes.sse import router as sse_router
from .routes.threads import router as threads_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()

    checkpointer = get_checkpointer()
    print(f"[Startup] Checkpointer initialized at {checkpointer.conn}")

    # Initialize async checkpointer for astream() compatibility
    async_checkpointer = get_async_checkpointer()
    await async_checkpointer.setup()
    print(f"[Startup] Async checkpointer initialized")

    yield


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
    app.include_router(ideas_router)
    app.include_router(chat_router)
    app.include_router(interrupts_router)
    app.include_router(sse_router)
    app.include_router(threads_router)

    return app
