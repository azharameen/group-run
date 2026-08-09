"""Team subgraph factory — builds LangGraph StateGraph instances from teams.yaml.

Reads team definitions from ``_teams_config`` (loaded by ``agent.runtime``) and
dynamically constructs LangGraph graphs.  Each agent in a team becomes a node
that wraps ``create_deep_agent`` with its specific configuration.

Dependencies flow downward only:

    Team Factory -> Agent Runtime helpers -> Tools & Backends

Subgraph types supported:
- **sequential**: nodes execute in the order specified by subgraph.nodes

Parallel and conditional subgraph types are deferred to future stories.
"""

from __future__ import annotations

import logging
from typing import Annotated
from typing import Any
from typing import TypedDict

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages

from ..agent.backends import build_agent_backend
from ..agent.context import DeepAgentContext
from ..agent.permissions import build_agent_permissions
from ..agent.runtime import (
    _load_mcp_tools,
    _load_system_prompt,
    _teams_config,
)
from ..agent.subagents import build_agent_subagents
from ..config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class TeamState(TypedDict, total=False):
    """State carried through a team subgraph.

    Fields
    ------
    messages : list[BaseMessage]
        Conversation history; reduced with ``add_messages`` so the graph
        appends / bumps rather than overwrites.
    response : str
        Final text response from the last agent in the chain.
    """

    messages: Annotated[list[Any], add_messages]
    response: str


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


class TeamSubgraphFactory:
    """Builds compiled LangGraph StateGraph instances from teams.yaml config.

    Reads from ``_teams_config`` (the module-level reference in ``agent.runtime``)
    so it stays in sync with config reloads without re-parsing files.

    Each agent in a team becomes a graph node that invokes ``create_deep_agent``
    with the agent's specific model, system prompt, backend, permissions, etc.
    """

    def _create_agent_node(
        self,
        agent_name: str,
        agent_config: dict[str, Any],
        team_description: str,
    ) -> Any:
        """Create an async LangGraph node function wrapping ``create_deep_agent``.

        The returned function is ``async def`` (matching ``supervisor_general``
        pattern). When invoked it:

        1. Creates a ``create_deep_agent`` instance with the agent's specific
           model, system prompt, backend, permissions, etc.
        2. Invokes the agent with the current state messages via ``ainvoke()``
        3. Returns the updated state dict

        Args:
            agent_name: Agent identifier used as the graph node key.
            agent_config: Agent definition dict from teams.yaml (name, model,
                role, system_prompt).
            team_description: Team description string prepended to the system
                prompt.

        Returns:
            An ``async def node_func(state: dict) -> dict`` callable ready for
            ``graph.add_node()``.
        """
        model = agent_config.get("model", "auto")
        if model == "auto":
            if not settings.deepagents_model:
                raise RuntimeError(
                    "Agent model is 'auto' but settings.deepagents_model is not "
                    "configured — cannot resolve model for agent "
                    f"'{agent_name}'"
                )
            model = settings.deepagents_model

        system_prompt = _load_system_prompt(team_description)

        agent_system_prompt = agent_config.get("system_prompt")
        if agent_system_prompt:
            system_prompt = f"{agent_system_prompt}\n\n{system_prompt}"

        async def node_func(state: dict[str, Any]) -> dict[str, Any]:
            from deepagents import create_deep_agent

            messages: list[Any] = state.get("messages", [])
            if not messages:
                return {"response": "", "messages": messages}

            # Build conversation context from prior messages so downstream
            # agents in a sequential chain see previous agent outputs.
            user_messages = [m for m in messages if isinstance(m, HumanMessage)]
            ai_messages = [m for m in messages if isinstance(m, AIMessage)]

            # Construct input: if there are prior AI responses (from previous
            # nodes in a sequential chain), prepend them as conversation
            # history so the agent has full context.
            parts: list[str] = []
            if ai_messages:
                parts.append("## Conversation History\n")
                for m in ai_messages:
                    content = getattr(m, "content", str(m))
                    sender = getattr(m, "name", "assistant") or "assistant"
                    parts.append(f"[{sender}]: {content}\n")
            if user_messages:
                last_user = getattr(
                    user_messages[-1], "content", str(user_messages[-1])
                )
                if last_user and str(last_user).strip():
                    if ai_messages:
                        parts.append(f"User: {last_user}")
                    else:
                        parts.append(str(last_user))

            if not parts:
                return {"response": "", "messages": messages}

            input_text = "\n".join(parts)

            mcp_tools = _load_mcp_tools()
            all_tools = mcp_tools if mcp_tools else None

            try:
                agent = create_deep_agent(
                    model=model,
                    system_prompt=system_prompt,
                    backend=build_agent_backend(),
                    permissions=build_agent_permissions(),
                    subagents=build_agent_subagents(),
                    context_schema=DeepAgentContext,
                    interrupt_on={
                        "write_file": True,
                        "edit_file": True,
                        "delete": True,
                    },
                    name=agent_name,
                    tools=all_tools,
                )

                result = await agent.ainvoke(
                    {"messages": input_text},
                    config={"recursion_limit": 50},
                )
            except Exception:
                logger.exception(
                    "Agent %s failed during ainvoke", agent_name
                )
                raise

            response = result.get("output", "") if isinstance(result, dict) else ""
            if isinstance(response, list) and response:
                last = response[-1]
                content = getattr(last, "content", None)
                if isinstance(content, str):
                    response = content
                elif isinstance(content, list):
                    text_parts = [
                        block.get("text", "") if isinstance(block, dict) else block
                        for block in content
                    ]
                    response = "\n".join(str(p) for p in text_parts).strip()
                else:
                    response = str(content) if content else str(last)

            ai_message = AIMessage(content=str(response), name=agent_name)
            updated_messages = list(messages) + [ai_message]
            return {"response": str(response), "messages": updated_messages}

        return node_func

    def _build_sequential_subgraph(
        self,
        team_name: str,
        team_config: dict[str, Any],
    ) -> StateGraph:
        """Wire agents as sequential nodes in a LangGraph StateGraph.

        For nodes [A, B, C]: entry -> A, A -> B, B -> C.
        For a single node: entry -> A (no edges).

        Args:
            team_name: Team key for logging and error messages.
            team_config: Full team definition dict from teams.yaml.

        Returns:
            A ``StateGraph`` with nodes added and edges wired in sequential order,
            entry point set.

        Raises:
            ValueError: If agent or subgraph configuration is invalid.
        """
        team_description = team_config.get("description", "")
        agents = team_config.get("agents", [])
        subgraph = team_config.get("subgraph", {})
        node_names = subgraph.get("nodes", []) if isinstance(subgraph, dict) else []

        if not node_names:
            raise ValueError(
                f"Team '{team_name}': subgraph.nodes is empty — "
                f"cannot build sequential subgraph without nodes"
            )

        if len(node_names) != len(set(node_names)):
            raise ValueError(
                f"Team '{team_name}': subgraph.nodes contains duplicates — "
                f"{sorted(node_names)}"
            )

        logger.info(
            "Building sequential subgraph for team '%s' with %d node(s): %s",
            team_name, len(node_names), node_names,
        )

        graph = StateGraph(TeamState)

        for name in node_names:
            agent_config = None
            for agent in agents:
                if agent.get("name") == name:
                    agent_config = agent
                    break
            if agent_config is None:
                raise ValueError(
                    f"Team '{team_name}': agent '{name}' not found in agents list"
                )

            node_func = self._create_agent_node(name, agent_config, team_description)
            graph.add_node(name, node_func)

        # Wire edges: A -> B -> C
        for i in range(len(node_names) - 1):
            graph.add_edge(node_names[i], node_names[i + 1])

        # First node is the entry point
        graph.set_entry_point(node_names[0])

        return graph

    def _validate_team_config(
        self,
        team_name: str,
        team_config: dict[str, Any],
    ) -> None:
        """Validate subgraph.nodes reference existing agents in the team.

        Args:
            team_name: Team key for error messages.
            team_config: Full team definition dict from teams.yaml.

        Raises:
            ValueError: If any node in subgraph.nodes does not correspond to an
                agent defined in the same team.
        """
        agent_names = {
            a["name"]
            for a in team_config.get("agents", [])
            if isinstance(a, dict)
        }

        subgraph = team_config.get("subgraph", {})
        if not isinstance(subgraph, dict):
            return

        for node in subgraph.get("nodes", []):
            if node not in agent_names:
                raise ValueError(
                    f"Team '{team_name}': subgraph.node '{node}' not found in "
                    f"agents list — available agents: {sorted(agent_names)}"
                )

    def create_team_subgraph(self, team_name: str) -> StateGraph:
        """Public interface — build a team subgraph from teams.yaml config.

        Validates the team exists, determines the subgraph type, performs
        referential integrity validation, and returns a configured StateGraph.
        The caller compiles the graph with ``graph.compile(checkpointer=...)``
        before invoking it.

        Args:
            team_name: Team key in teams.yaml.

        Returns:
                A configured ``StateGraph`` with nodes and edges wired.
                Callers compile it with ``graph.compile(checkpointer=...)`` before
                invoking via ``ainvoke`` / ``astream``.

        Raises:
            ValueError: If the team is not defined or has invalid configuration.
            RuntimeError: If model resolution fails (e.g., ``model="auto"`` with
                no ``settings.deepagents_model``).
        """
        teams = _teams_config.get("teams", {})
        if team_name not in teams:
            available = list(teams.keys())
            raise ValueError(
                f"Team '{team_name}' not found in teams.yaml. "
                f"Available teams: {available}"
            )

        team_config = teams[team_name]

        # Validate referential integrity
        self._validate_team_config(team_name, team_config)

        # Determine subgraph config
        subgraph = team_config.get("subgraph", {})
        if not subgraph or not isinstance(subgraph, dict):
            # No subgraph defined — use agents list as sequential default
            agents = team_config.get("agents", [])
            if not agents:
                raise ValueError(
                    f"Team '{team_name}': no agents defined and no subgraph "
                    f"configuration — cannot build subgraph"
                )
            # Build a default sequential config using agents list
            node_names = [a["name"] for a in agents if isinstance(a, dict)]
            subgraph = {"type": "sequential", "nodes": node_names}
            team_config = {**team_config, "subgraph": subgraph}

        subgraph_type = subgraph.get("type", "sequential")
        if subgraph_type != "sequential":
            raise ValueError(
                f"Team '{team_name}': subgraph type '{subgraph_type}' is not "
                f"supported — only 'sequential' is implemented"
            )

        return self._build_sequential_subgraph(team_name, team_config)
