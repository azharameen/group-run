"""DeepAgents subagent definitions built from current workflow roles."""

from typing import Any

from ..orchestrator.subagents.definitions import ALL_SUBAGENTS


def build_agent_subagents() -> list[dict[str, Any]]:
    """Convert current workflow role definitions into DeepAgents subagents."""

    subagents: list[dict[str, Any]] = []
    for definition in ALL_SUBAGENTS:
        subagents.append(
            {
                "name": definition.name,
                "description": definition.description,
                "system_prompt": definition.instructions,
            }
        )
    return subagents
