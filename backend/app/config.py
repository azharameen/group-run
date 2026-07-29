"""Application configuration from environment variables."""

import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_api_base: str = ""
    openai_model_name: str = ""
    deepagents_model: str = ""

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    workflow_interval_minutes: int = 15
    max_retries_per_state: int = 3
    composite_threshold: int = 70
    gate_threshold_percent: int = 50

    # Compute .env path relative to this file (backend/app/config.py -> repo root)
    model_config = SettingsConfigDict(
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
        env_file=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
        env_file_encoding="utf-8",
    )

    @model_validator(mode="after")
    def derive_defaults(self) -> "Settings":
        if not self.deepagents_model and self.openai_model_name:
            self.deepagents_model = f"openai:{self.openai_model_name}"
        return self


settings = Settings()

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
