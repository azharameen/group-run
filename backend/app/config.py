"""Application configuration from environment variables."""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = "sk-placeholder"
    openai_api_base: str = "https://api.openai.com/v1"
    openai_model_name: str = "gpt-4o"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    workflow_interval_minutes: int = 15
    max_retries_per_state: int = 3
    composite_threshold: int = 70
    gate_threshold_percent: int = 50

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WORKSPACE_DIR = os.path.join(ROOT_DIR, "workspace")
CONFIG_DIR = os.path.join(ROOT_DIR, "config")
INSTRUCTIONS_DIR = os.path.join(ROOT_DIR, "instructions")
KNOWLEDGE_BASE_DIR = os.path.join(ROOT_DIR, "knowledge-base")
