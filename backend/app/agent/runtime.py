"""DeepAgents runtime factory with team-aware configuration (AD-7, AD-14)."""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import yaml

from ..config import (
    INSTRUCTIONS_DIR,
    MCP_CONFIG_PATH,
    MCP_SCHEMA_VERSION,
    TEAMS_CONFIG_PATH,
    TEAMS_SCHEMA_VERSION,
    settings,
)
from .backends import build_agent_backend
from .context import DeepAgentContext
from .permissions import build_agent_permissions
from .subagents import build_agent_subagents

logger = logging.getLogger(__name__)

# Default MCP connection timeout in seconds (AC-5).
DEFAULT_MCP_TIMEOUT = 10

# ── Module-level config validation (AD-11 fail-fast) ────────────────────

def _load_and_validate_teams() -> dict:
    """Load and validate teams.yaml at import time."""
    path = Path(TEAMS_CONFIG_PATH)
    if not path.exists():
        raise ValueError(f"Teams config not found: {TEAMS_CONFIG_PATH}")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"Failed to parse {TEAMS_CONFIG_PATH}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Teams config must be a YAML mapping: {TEAMS_CONFIG_PATH}")
    version = data.get("schema_version")
    if version != TEAMS_SCHEMA_VERSION:
        raise ValueError(
            f"Teams schema version mismatch: expected {TEAMS_SCHEMA_VERSION}, "
            f"got {version!r} in {TEAMS_CONFIG_PATH}"
        )
    logger.info("Teams config loaded: teams=%s", list(data.get("teams", {}).keys()))
    return data


_teams_config: dict = _load_and_validate_teams()


# Validate MCP_CONFIG_PATH exists (not parseable until _load_mcp_tools is called).
_mcp_config_path = Path(MCP_CONFIG_PATH)
if not _mcp_config_path.exists():
    logger.warning("MCP config not found: %s — falling back to MCP_SERVERS env var", MCP_CONFIG_PATH)


def _load_system_prompt(team_description: str = "") -> str:
    """Load the system prompt, optionally prepending team context."""
    path = Path(INSTRUCTIONS_DIR) / "global-agent-instructions.md"
    if path.exists():
        base_prompt = path.read_text(encoding="utf-8")
    else:
        base_prompt = "You are the Siemens patent idea generation and review system."
    if team_description:
        return f"{team_description}\n\n{base_prompt}"
    return base_prompt


def _load_mcp_tools() -> list[Any]:
    """Load tools from configured MCP servers (AD-14 file-first precedence).

    Reads ``config/mcp.json`` first, falls back to ``MCP_SERVERS`` env var.
    Enforces HTTP connection timeouts (default 10s, AC-5).
    """
    # 1. Try config/mcp.json first (AD-14 file precedence)
    if _mcp_config_path.exists():
        try:
            mcp_data = json.loads(_mcp_config_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            logger.error("MCP config invalid JSON: %s", MCP_CONFIG_PATH)
            return []

        version = mcp_data.get("schema_version")
        if version and version != MCP_SCHEMA_VERSION:
            logger.warning("MCP schema version mismatch: expected %s, got %s", MCP_SCHEMA_VERSION, version)

        servers = mcp_data.get("servers", [])
        if servers:
            # Convert array format [{name: "...", ...}] to dict {"name": {...}}
            connections = {s["name"]: {k: v for k, v in s.items() if k != "name"} for s in servers if s.get("name")}
            logger.info("MCP tools loaded from file: %s", MCP_CONFIG_PATH)
            return _create_mcp_tools(connections)
        # Empty servers: [] — file is authoritative (AD-14); no env var fallback
        logger.info("MCP tools: file exists but servers is empty — no MCP tools")
        return []

    # 2. Fall back to MCP_SERVERS env var (only when file is missing)
    raw = settings.mcp_servers
    if not raw:
        return []

    try:
        connections = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.error("MCP configuration invalid: failed to parse MCP_SERVERS JSON")
        return []

    if not isinstance(connections, dict) or not connections:
        return []

    logger.info("MCP tools loaded from env var: MCP_SERVERS")
    return _create_mcp_tools(connections)


def _create_mcp_tools(connections: dict[str, dict]) -> list[Any]:
    """Create MCP tool instances from connection configs."""
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        for config in connections.values():
            if isinstance(config, dict) and config.get("transport", "").lower() == "http":
                config.setdefault("timeout", DEFAULT_MCP_TIMEOUT)

        client = MultiServerMCPClient(connections)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is None:
            tools = asyncio.run(client.get_tools())
        else:
            tools = loop.run_until_complete(client.get_tools())
        logger.info("MCP tools loaded: count=%d, servers=%s", len(tools), list(connections.keys()))
        return tools
    except ImportError as exc:
        logger.error("MCP tools unavailable: langchain_mcp_adapters not installed — %s", exc)
        return []
    except Exception as exc:
        logger.error("MCP tools failed: servers=%s, error=%s", list(connections.keys()), type(exc).__name__)
        return []


def get_deep_agent_runtime(team_name: str = "general"):
    """Return a compiled DeepAgents graph for the given team.

    Loads team-specific configuration from ``config/teams.yaml`` including
    team description (prepended to system prompt) and subagent definitions.

    Args:
        team_name: Team key in teams.yaml (default: ``"general"``).

    Returns:
        Compiled DeepAgents graph ready for invocation.

    Raises:
        ValueError: If the named team is not defined in teams.yaml.
        RuntimeError: If DeepAgents model configuration is missing.
    """
    if not settings.deepagents_model:
        raise RuntimeError("DeepAgents model configuration is required.")

    # Validate team exists
    team = _teams_config.get("teams", {}).get(team_name)
    if team is None:
        available = list(_teams_config.get("teams", {}).keys())
        raise ValueError(
            f"Team '{team_name}' not found in teams.yaml. "
            f"Available teams: {available}"
        )

    team_description = team.get("description", "")
    agent_name = f"{team_name}-agent"

    from deepagents import create_deep_agent
    from ..services.thread_manager import get_checkpointer

    interrupt_on = {
        "write_file": True,
        "edit_file": True,
        "delete": True,
    }

    mcp_tools = _load_mcp_tools()
    all_tools = mcp_tools if mcp_tools else None

    return create_deep_agent(
        model=settings.deepagents_model,
        system_prompt=_load_system_prompt(team_description),
        backend=build_agent_backend(),
        permissions=build_agent_permissions(),
        subagents=build_agent_subagents(team_name),
        context_schema=DeepAgentContext,
        interrupt_on=interrupt_on,
        checkpointer=get_checkpointer(),
        name=agent_name,
        tools=all_tools,
    )
