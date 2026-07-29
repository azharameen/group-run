"""Observability helpers for LangSmith / LangChain tracing."""

from __future__ import annotations

import os
from typing import Any

from ..config import settings


def configure_langsmith_tracing() -> dict[str, Any]:
    """Enable LangSmith tracing through LangChain environment variables."""
    enabled = bool(settings.langsmith_enabled and settings.langsmith_api_key)

    if enabled:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGSMITH_TRACING"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langsmith_project
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langsmith_endpoint
    else:
        for key in [
            "LANGCHAIN_TRACING_V2",
            "LANGSMITH_TRACING",
            "LANGCHAIN_API_KEY",
            "LANGCHAIN_PROJECT",
            "LANGCHAIN_ENDPOINT",
        ]:
            os.environ.pop(key, None)

    return get_observability_status()


def get_observability_status() -> dict[str, Any]:
    """Return the current LangSmith tracing state."""
    return {
        "langsmith_enabled": bool(settings.langsmith_enabled and settings.langsmith_api_key),
        "project": settings.langsmith_project,
        "endpoint": settings.langsmith_endpoint,
        "tracing_v2": os.environ.get("LANGCHAIN_TRACING_V2", "false"),
        "configured": bool(os.environ.get("LANGCHAIN_API_KEY")),
    }
