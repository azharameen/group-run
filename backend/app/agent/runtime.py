"""DeepAgents runtime factory."""

import json
from pathlib import Path
from typing import Any

from ..config import INSTRUCTIONS_DIR, settings
from .backends import build_agent_backend
from .context import DeepAgentContext
from .permissions import build_agent_permissions
from .subagents import build_agent_subagents


def _load_system_prompt() -> str:
    path = Path(INSTRUCTIONS_DIR) / "global-agent-instructions.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return "You are the Siemens patent idea generation and review system."


def _load_mcp_tools() -> list[Any]:
    """Load tools from configured MCP servers.

    Reads ``MCP_SERVERS`` env var (JSON dict mapping server names to
    connection configs). Returns an empty list when no servers are
    configured or when the MCP adapter package is unavailable.
    """
    raw = settings.mcp_servers
    if not raw:
        return []

    try:
        connections = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []

    if not isinstance(connections, dict) or not connections:
        return []

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        client = MultiServerMCPClient(connections)
        import asyncio
        tools = asyncio.run(client.get_tools())
        print(f"[MCP] Loaded {len(tools)} tools from {len(connections)} server(s): {list(connections.keys())}")
        return tools
    except Exception as exc:
        print(f"[MCP] Skipping MCP tools: {exc}")
        return []


def get_deep_agent_runtime():
    """Return a compiled DeepAgents graph.

    Credentials are propagated to OS environment variables at config import
    time (see config.py) so LangChain's init_chat_model — called internally
    by create_deep_agent — can find OPENAI_API_KEY and OPENAI_API_BASE.

    Uses SqliteSaver as the checkpointer for persistent thread state.
    Optional MCP server tools are loaded when ``MCP_SERVERS`` env var is set.
    """
    if not settings.deepagents_model:
        raise RuntimeError("DeepAgents model configuration is required.")

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
        system_prompt=_load_system_prompt(),
        backend=build_agent_backend(),
        permissions=build_agent_permissions(),
        subagents=build_agent_subagents(),
        context_schema=DeepAgentContext,
        interrupt_on=interrupt_on,
        checkpointer=get_checkpointer(),
        name="ideator-agent",
        tools=all_tools,
    )
