"""DeepAgents runtime factory with team-aware configuration (AD-7, AD-14)."""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import yaml

from .. import config as _config
from ..config import (
    INSTRUCTIONS_DIR,
    MCP_CONFIG_PATH,
    MCP_SCHEMA_VERSION,
    ROOT_DIR,
    TEAMS_CONFIG_PATH,  # noqa: F401  # re-export: tests monkeypatch app.agent.runtime.TEAMS_CONFIG_PATH
    TEAMS_SCHEMA_VERSION,
    settings,
)
from ..config_schemas import validate_mcp_config, validate_teams_config
from ..providers.runtime import get_configured_chat_model, has_active_provider
from ..work_items.tools import DOMAIN_TOOLS
from .backends import build_agent_backend
from .context import DeepAgentContext
from .permissions import build_agent_permissions
from .subagents import build_agent_subagents

logger = logging.getLogger(__name__)

# Default MCP connection timeout in seconds (AC-5).
DEFAULT_MCP_TIMEOUT = 10

# ── Module-level config validation (AD-11 fail-fast) ────────────────────

def _load_and_validate_teams() -> dict:
    """Load and validate teams.yaml at import time.

    Validates:
    - File exists and is valid YAML
    - Schema version matches
    - Teams collection is non-empty
    - No duplicate routing_keys across teams
    - subgraph.nodes reference agents defined in the same team
    """
    # Read from module reference at runtime to pick up monkeypatches
    # (test_chat_endpoint.py clears app.config from sys.modules, causing
    # a reimport that would overwrite module-level bindings)
    teams_path = _config.TEAMS_CONFIG_PATH
    path = Path(teams_path)
    if not path.exists():
        raise ValueError(f"Teams config not found: {teams_path}")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"Failed to parse {teams_path}: {exc}") from exc
    if not isinstance(data, dict):
        # ValueError (not TypeError) is the documented config-error contract
        raise ValueError(f"Teams config must be a YAML mapping: {teams_path}")  # noqa: TRY004
    version = data.get("schema_version")
    if version != TEAMS_SCHEMA_VERSION:
        raise ValueError(
            f"Teams schema version mismatch: expected {TEAMS_SCHEMA_VERSION}, "
            f"got {version!r} in {teams_path}"
        )

    teams = data.get("teams", {})
    if not teams:
        raise ValueError(f"Teams config must define at least one team: {teams_path}")

    # Validate no duplicate routing_keys across teams
    seen_keys: dict[str, str] = {}
    for team_name, team_def in teams.items():
        if not isinstance(team_def, dict):
            continue
        for key in team_def.get("routing_keys", []):
            if key in seen_keys:
                raise ValueError(
                    f"Duplicate routing_key '{key}' in teams '{seen_keys[key]}' and "
                    f"'{team_name}' — routing_keys must be globally unique"
                )
            seen_keys[key] = team_name

    # Validate subgraph.nodes referential integrity
    for team_name, team_def in teams.items():
        if not isinstance(team_def, dict):
            continue
        agent_names = {a["name"] for a in team_def.get("agents", []) if isinstance(a, dict)}
        subgraph = team_def.get("subgraph", {})
        if not isinstance(subgraph, dict):
            continue
        for node in subgraph.get("nodes", []):
            if node not in agent_names:
                raise ValueError(
                    f"Team '{team_name}': subgraph.node '{node}' not found in "
                    f"agents list — available agents: {sorted(agent_names)}"
                )

    # Schema-level validation (complements manual checks above)
    schema_errors = validate_teams_config(data, teams_path)
    if schema_errors:
        raise ValueError(
            f"Teams config schema errors: {'; '.join(schema_errors)}"
        )

    logger.info("Teams config loaded: teams=%s", list(teams.keys()))
    return data


_teams_config: dict = _load_and_validate_teams()


def _reload_teams_config() -> dict:
    """Re-read and re-validate teams.yaml, then update in-memory `_teams_config`.

    Loads fresh from disk and runs full validation via `_load_and_validate_teams()`.
    Only updates `_teams_config` if validation passes completely — on failure the
    original config is preserved (atomic reload, no partial state).
    Updates the global dictionary in-place to ensure other modules holding a
    reference to it (like team_factory.py) see the new data (AD-14).

    Raises:
        ValueError: if the file is missing, invalid, or fails validation.

    Returns:
        The newly loaded and validated teams config dict.
    """
    new_config = _load_and_validate_teams()  # raises ValueError on failure
    _teams_config.clear()
    _teams_config.update(new_config)
    logger.info("Teams config reloaded: teams=%s", list(new_config.get("teams", {}).keys()))
    return _teams_config


# Warn at startup if MCP config is missing (non-blocking).
_mcp_config_path_startup = Path(MCP_CONFIG_PATH)
if not _mcp_config_path_startup.exists():
    logger.warning("MCP config not found: %s — falling back to MCP_SERVERS env var", MCP_CONFIG_PATH)


def _load_system_prompt(team_description: str = "") -> str:
    """Load the system prompt, optionally prepending team context."""
    path = Path(INSTRUCTIONS_DIR) / "global-agent-instructions.md"
    if path.exists():
        base_prompt = path.read_text(encoding="utf-8")
    else:
        base_prompt = "You are an AI assistant in the Companion agentic organization platform."
    if team_description:
        return f"{team_description}\n\n{base_prompt}"
    return base_prompt


def _load_mcp_tools() -> list[Any]:
    """Load tools from configured MCP servers (AD-14 file-first precedence).

    Reads ``config/mcp.json`` fresh from disk on each call, falls back to
    ``MCP_SERVERS`` env var when the file is missing.
    Enforces HTTP connection timeouts (default 10s, AC-5).

    MCP_CONFIG_PATH is read from the config module at runtime to pick up
    test monkeypatches (test_chat_endpoint.py clears app.config from
    sys.modules, causing a reimport that would overwrite module-level
    bindings).
    """
    # Read from module reference at runtime to pick up monkeypatches
    mcp_path = Path(_config.MCP_CONFIG_PATH)

    # 1. Try config/mcp.json first (AD-14 file precedence)
    if mcp_path.exists():
        try:
            mcp_data = json.loads(mcp_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.error("MCP config invalid JSON: %s", _config.MCP_CONFIG_PATH)
            return []

        version = mcp_data.get("schema_version")
        if version and version != MCP_SCHEMA_VERSION:
            logger.warning("MCP schema version mismatch: expected %s, got %s", MCP_SCHEMA_VERSION, version)

        servers = mcp_data.get("servers", [])
        if not isinstance(servers, list):
            logger.error("MCP config: 'servers' must be an array, got %s", type(servers).__name__)
            return []
        if servers:
            # Convert array format [{name: "...", ...}] to dict {"name": {...}}
            seen: set[str] = set()
            connections: dict[str, dict[str, Any]] = {}
            for s in servers:
                name = s.get("name")
                if not name:
                    continue
                if name in seen:
                    logger.warning("MCP config: duplicate server name '%s' — last entry wins", name)
                seen.add(name)
                connections[name] = {k: v for k, v in s.items() if k != "name"}
            logger.info("MCP tools loaded from file: %s", _config.MCP_CONFIG_PATH)
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


def _validate_mcp_config() -> list[dict]:
    """Read and validate mcp.json, returning the servers list.

    Returns:
        List of server config dicts from mcp.json.

    Raises:
        ValueError: if the file is missing, invalid JSON, or has invalid structure.
    """
    mcp_path = Path(_config.MCP_CONFIG_PATH)
    if not mcp_path.exists():
        raise ValueError(f"MCP config not found: {_config.MCP_CONFIG_PATH}")

    try:
        content = mcp_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"Cannot read {_config.MCP_CONFIG_PATH}: {exc}") from exc

    if not content.strip():
        raise ValueError(f"MCP config is empty: {_config.MCP_CONFIG_PATH}")

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {_config.MCP_CONFIG_PATH}: {exc}") from exc

    if not isinstance(data, dict):
        # ValueError (not TypeError) is the documented config-error contract
        raise ValueError(f"MCP config must be a JSON object: {_config.MCP_CONFIG_PATH}")  # noqa: TRY004

    servers = data.get("servers", [])
    if not isinstance(servers, list):
        # ValueError (not TypeError) is the documented config-error contract
        raise ValueError(f"MCP config 'servers' must be an array: {_config.MCP_CONFIG_PATH}")  # noqa: TRY004

    # Schema-level validation (complements manual checks above)
    schema_errors = validate_mcp_config(data, str(_config.MCP_CONFIG_PATH))
    if schema_errors:
        raise ValueError(
            f"MCP config schema errors: {'; '.join(schema_errors)}"
        )

    return servers


def _create_mcp_tools(connections: dict[str, dict]) -> list[Any]:
    """Create MCP tool instances from connection configs.

    Each server connection gets its own timeout (from config or DEFAULT_MCP_TIMEOUT).
    Timeouts apply to both HTTP and stdio transports.

    NOTE: MCP tool loading is inherently async (requires network I/O).
    When called from a sync context, ``asyncio.run()`` is used.
    When called from an existing event loop (ASGI handler), loading is
    skipped with a warning — the agent runs without MCP tools.
    Full async MCP loading is tracked for future implementation.
    """
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        # Per-server timeout with default fallback (AC: per-server settings)
        # Skip stdio transports — they don't support HTTP timeouts
        for name, config in connections.items():
            if not isinstance(config, dict):
                continue
            if config.get("transport") != "stdio" and "timeout" not in config:
                config["timeout"] = DEFAULT_MCP_TIMEOUT
            logger.debug(
                "MCP server '%s' timeout: %s (transport: %s)",
                name,
                config.get("timeout", "N/A for stdio"),
                config.get("transport", "http"),
            )

        client = MultiServerMCPClient(connections)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None:
            # Already inside an event loop — asyncio.run() and
            # loop.run_until_complete() both crash here.
            # Fall back gracefully: agent runs without MCP tools.
            logger.warning(
                "MCP tools skipped (called from active event loop — "
                "servers=%s). Async MCP loading not yet implemented.",
                list(connections.keys()),
            )
            return []

        tools = asyncio.run(client.get_tools())
        logger.info("MCP tools loaded: count=%d, servers=%s", len(tools), list(connections.keys()))
        return tools
    except ImportError as exc:
        logger.error("MCP tools unavailable: langchain_mcp_adapters not installed — %s", exc)
        return []
    except Exception as exc:  # noqa: BLE001  # degrade to no-tools rather than crash startup
        logger.error("MCP tools failed: servers=%s, error=%s", list(connections.keys()), type(exc).__name__)
        return []


def _memory_sources() -> list[str] | None:
    """Enumerate memory files under ``ROOT_DIR/memories`` as virtual paths.

    deepagents' MemoryMiddleware loads each configured source as an
    individual *file* — a directory path raises ``is_directory`` — so list
    the actual files instead of pointing at the directory. ``None`` when no
    memory files exist (the middleware is then skipped entirely).
    """
    memories_dir = Path(ROOT_DIR) / "memories"
    if not memories_dir.is_dir():
        return None
    sources = [
        f"/memories/{p.relative_to(memories_dir).as_posix()}"
        for p in sorted(memories_dir.rglob("*"))
        if p.is_file()
    ]
    return sources or None


def _graph_checkpointer(thread_manager_module):
    """Resolve the checkpointer for the compiled deep agent graph."""
    checkpointer = getattr(thread_manager_module, "_PG_CHECKPOINTER", None)
    if checkpointer is not None:
        return checkpointer

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        try:
            return asyncio.run(thread_manager_module.get_pg_checkpointer())
        except RuntimeError:
            logger.warning(
                "Async checkpointer unavailable; compiling graph without checkpointer"
            )
            return None

    logger.warning(
        "Async checkpointer unavailable; compiling graph without checkpointer"
    )
    return None



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
    if not settings.deepagents_model and not has_active_provider():
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

    from ..services import thread_manager

    interrupt_on = {
        "write_file": True,
        "edit_file": True,
        "delete": True,
    }

    mcp_tools = _load_mcp_tools()
    # Domain tools (Story 8.2: submit_work_item) are always present,
    # alongside any configured MCP tools.
    all_tools = (mcp_tools or []) + list(DOMAIN_TOOLS)

    # ``resolve_chat_model`` substitutes the deterministic local mock when the
    # configured model is the ``openai:test-model`` sentinel (NFR-A10) so CI /
    # E2E runs never make a live LLM call; otherwise the string is passed
    # through for ``create_deep_agent`` to instantiate the real provider.
    return create_deep_agent(
        model=get_configured_chat_model(settings.deepagents_model),
        system_prompt=_load_system_prompt(team_description),
        backend=build_agent_backend(),
        permissions=build_agent_permissions(),
        subagents=build_agent_subagents(team_name),
        skills=["/skills/"],
        memory=_memory_sources(),
        context_schema=DeepAgentContext,
        interrupt_on=interrupt_on,
        checkpointer=_graph_checkpointer(thread_manager),
        name=agent_name,
        tools=all_tools,
    )
