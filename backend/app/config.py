"""Application configuration from environment variables."""

import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_api_base: str = ""
    openai_model_name: str = ""
    deepagents_model: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "ideator"
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_enabled: bool = False

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    mcp_servers: str = ""

    langgraph_strict_msgpack: str = ""

    storage_dir: str = ""

    # Agent timeout and retry configuration (AC: 1-2)
    agent_timeout_sec: int = 120

    # Compute .env path relative to this file (backend/app/config.py -> repo root)
    model_config = SettingsConfigDict(
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
        env_file=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
        env_file_encoding="utf-8",
    )

    @model_validator(mode="after")
    def validate_strict_msgpack(self) -> "Settings":
        # Validate only when the env var is explicitly set.
        # When unset (fresh env without .env), default to compliant behavior
        # and warn — this avoids crashing pytest fixtures and fresh imports.
        val = os.environ.get("LANGGRAPH_STRICT_MSGPACK", "")
        if val and val.lower() != "true":
            raise ValueError(
                "LANGGRAPH_STRICT_MSGPACK must be set to 'true' — "
                "required for LangGraph checkpoint serialization safety"
            )
        if not val:
            import logging
            logging.getLogger(__name__).warning(
                "LANGGRAPH_STRICT_MSGPACK not set — assuming compliant runtime. "
                "Set to 'true' in .env for explicit compliance."
            )
        return self

    @model_validator(mode="after")
    def derive_defaults(self) -> "Settings":
        if not self.deepagents_model and self.openai_model_name:
            self.deepagents_model = f"openai:{self.openai_model_name}"
        return self


settings = Settings()

# ── Propagate credentials to OS environment ──────────────────────────────
# LangChain's init_chat_model (called internally by create_deep_agent and
# other LangChain constructors) reads credentials from standard environment
# variables (OPENAI_API_KEY, OPENAI_API_BASE), NOT from pydantic-settings.
# We must propagate them here so any downstream code that creates a model
# instance can authenticate.
if settings.openai_api_key and not os.environ.get("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = settings.openai_api_key
if settings.openai_api_base and not os.environ.get("OPENAI_API_BASE"):
    os.environ["OPENAI_API_BASE"] = settings.openai_api_base
if settings.openai_model_name and not os.environ.get("OPENAI_MODEL_NAME"):
    os.environ["OPENAI_MODEL_NAME"] = settings.openai_model_name

# ROOT_DIR must point at the directory that directly contains workspace/,
# config/, instructions/, and knowledge-base/.
#
# Locally the package lives at <repo>/backend/app/config.py, so walking up two
# levels from this file's directory (app -> backend -> <repo>) lands on the
# repo root, which is correct.
#
# Inside the Docker image, the Dockerfile does `WORKDIR /app` then
# `COPY app/ ./app/`, so this file lives at /app/app/config.py — one
# directory level shallower than the local layout (there is no "backend"
# folder). Walking up two levels there would incorrectly resolve to "/"
# instead of "/app", causing every filesystem write to land outside the
# mounted volumes and disappear on container restart.
#
# APP_ROOT_DIR lets deployments (docker-compose.yml) pin the correct
# directory explicitly instead of relying on fragile path-depth guessing.
_default_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ROOT_DIR = os.environ.get("APP_ROOT_DIR") or _default_root
WORKSPACE_DIR = os.path.join(ROOT_DIR, "workspace")
CONFIG_DIR = os.path.join(ROOT_DIR, "config")
INSTRUCTIONS_DIR = os.path.join(ROOT_DIR, "instructions")
KNOWLEDGE_BASE_DIR = os.path.join(ROOT_DIR, "knowledge-base")
STORAGE_DIR = settings.storage_dir or os.path.join(ROOT_DIR, "storage")

# ── Config file paths ────────────────────────────────────────────────────
TEAMS_CONFIG_PATH = os.path.join(CONFIG_DIR, "teams.yaml")
MCP_CONFIG_PATH = os.path.join(CONFIG_DIR, "mcp.json")

# ── Schema versions (must match config file schema_version fields) ────────
TEAMS_SCHEMA_VERSION = "1.0"
MCP_SCHEMA_VERSION = "1.0"
