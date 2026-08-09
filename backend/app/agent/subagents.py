"""DeepAgents subagent definitions from teams.yaml (AD-7)."""

from pathlib import Path
from typing import Any

import logging
import yaml

from ..config import TEAMS_CONFIG_PATH, settings

logger = logging.getLogger(__name__)


def build_agent_subagents(team_name: str = "general") -> list[dict[str, Any]]:
    """Return subagent definitions from team configuration.

    Reads ``config/teams.yaml``, extracts the agents list for the named
    team, and maps each entry to a DeepAgents subagent dict.

    Args:
        team_name: Team key in teams.yaml (default: ``"general"``).

    Returns:
        List of subagent dicts with ``name``, ``role``, ``model``, and
        ``system_prompt`` keys. Empty list if team has no agents defined.
    """
    teams_data = yaml.safe_load(Path(TEAMS_CONFIG_PATH).read_text(encoding="utf-8"))
    team = teams_data.get("teams", {}).get(team_name, {})
    team_description = team.get("description", "")
    agents = team.get("agents", [])

    subagents: list[dict[str, Any]] = []
    for agent_entry in agents:
        name = agent_entry.get("name")
        if not name:
            logger.warning("Agent entry missing 'name' in %s — skipping", TEAMS_CONFIG_PATH)
            continue
        model = agent_entry.get("model", "auto")
        if model == "auto":
            model = settings.deepagents_model
        system_prompt = agent_entry.get(
            "system_prompt",
            f"{team_description} You are {name}.",
        )
        description = agent_entry.get(
            "description",
            agent_entry.get("role", "assistant"),
        )
        subagents.append(
            {
                "name": name,
                "role": agent_entry.get("role", "assistant"),
                "model": model,
                "system_prompt": system_prompt,
                "description": description,
                "skills": agent_entry.get("skills", ["/skills/"]),
            }
        )

    return subagents
