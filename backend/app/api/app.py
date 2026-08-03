"""FastAPI app factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..infrastructure.observability import configure_langsmith_tracing
from ..storage.yaml_io import load_idea_registry, recover_from_filesystem
from .routes.chat import router as chat_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()

    recovered = recover_from_filesystem()
    if recovered > 0:
        print(f"[Startup] Recovered {recovered} idea(s) from filesystem")

    registry = load_idea_registry()
    print(f"[Startup] Loaded {len(registry.get('ideas', []))} ideas from registry")

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
    from .routes.threads import router as threads_router

    app.include_router(threads_router)
    return app
