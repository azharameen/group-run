"""Tests for TeamSubgraphFactory (ST-5.4).

Covers sequential subgraph construction, validation, error handling,
and model resolution for team definitions from teams.yaml.
"""

import asyncio
import sys
import types
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clear_modules(monkeypatch: pytest.MonkeyPatch):
    """Clear team_factory and dependency modules so imports are fresh."""
    for mod in list(sys.modules.keys()):
        if any(
            mod.startswith(prefix)
            for prefix in (
                "app.orchestrator.team_factory",
                "app.orchestrator",
                "app.agent.runtime",
                "app.agent.backends",
                "app.agent.permissions",
                "app.agent.subagents",
                "app.agent.context",
                "app.agent",
            )
        ):
            del sys.modules[mod]


def _stub_deepagents(monkeypatch: pytest.MonkeyPatch):
    """Provide stub modules for deepagents so factory imports succeed."""
    da = types.ModuleType("deepagents")
    backends = types.ModuleType("deepagents.backends")

    class _CompositeBackend:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _FilesystemBackend:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _StateBackend:
        pass

    class _FilesystemPermission:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    def _create_deep_agent(**kwargs):
        return MagicMock()

    backends.CompositeBackend = _CompositeBackend
    backends.FilesystemBackend = _FilesystemBackend
    backends.StateBackend = _StateBackend
    da.FilesystemPermission = _FilesystemPermission
    da.create_deep_agent = _create_deep_agent

    monkeypatch.setitem(sys.modules, "deepagents", da)
    monkeypatch.setitem(sys.modules, "deepagents.backends", backends)


def _patch_teams_config(new_config: dict):
    """Modify _teams_config in-place with the provided config dict.

    IMPORTANT: Must modify in-place (clear + update) rather than reassign,
    because team_factory imports _teams_config by reference.

    Must be called BEFORE importing team_factory.
    """
    from app.agent import runtime as runtime_mod
    runtime_mod._teams_config.clear()
    runtime_mod._teams_config.update(new_config)


# Base teams config used by most tests (mirrors config/teams.yaml)
_BASE_TEAMS_CONFIG = {
    "schema_version": "1.0",
    "teams": {
        "general": {
            "name": "General Assistant",
            "description": "Default team for general inquiries.",
            "agents": [
                {"name": "general-assistant", "role": "assistant", "model": "auto"}
            ],
            "tools": ["search", "knowledge_base"],
            "subgraph": {
                "type": "sequential",
                "nodes": ["general-assistant"],
            },
            "routing_keys": ["general", "default", "fallback"],
        }
    },
}


# ---------------------------------------------------------------------------
# Factory instantiation
# ---------------------------------------------------------------------------


def test_team_factory_instantiation(monkeypatch: pytest.MonkeyPatch):
    """TeamSubgraphFactory can be instantiated without error."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()
    assert factory is not None


# ---------------------------------------------------------------------------
# Sequential subgraph -- single agent
# ---------------------------------------------------------------------------


def test_sequential_subgraph_single_agent(monkeypatch: pytest.MonkeyPatch):
    """Sequential subgraph with single agent produces valid graph with entry point."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(_BASE_TEAMS_CONFIG)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()
    graph = factory.create_team_subgraph("general")

    assert isinstance(graph, StateGraph)
    assert "general-assistant" in graph.nodes
    # Entry point is stored as ('__start__', node_name) in graph.edges
    assert ("__start__", "general-assistant") in graph.edges


# ---------------------------------------------------------------------------
# Sequential subgraph -- multiple agents
# ---------------------------------------------------------------------------


def test_sequential_subgraph_multiple_agents(monkeypatch: pytest.MonkeyPatch):
    """Sequential subgraph with multiple agents wires nodes in order with edges."""
    custom_config = {
        "schema_version": "1.0",
        "teams": {
            "research": {
                "name": "Research Team",
                "description": "Team for research tasks.",
                "agents": [
                    {"name": "researcher", "role": "researcher", "model": "auto"},
                    {"name": "analyst", "role": "analyst", "model": "auto"},
                ],
                "subgraph": {
                    "type": "sequential",
                    "nodes": ["researcher", "analyst"],
                },
                "routing_keys": ["research"],
            }
        },
    }

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(custom_config)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()
    graph = factory.create_team_subgraph("research")

    assert isinstance(graph, StateGraph)
    assert "researcher" in graph.nodes
    assert "analyst" in graph.nodes
    # Entry point is researcher
    assert ("__start__", "researcher") in graph.edges
    # Edge: researcher -> analyst
    assert ("researcher", "analyst") in graph.edges


# ---------------------------------------------------------------------------
# Unknown team name
# ---------------------------------------------------------------------------


def test_unknown_team_raises_value_error(monkeypatch: pytest.MonkeyPatch):
    """create_team_subgraph with unknown team raises ValueError with available teams."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(_BASE_TEAMS_CONFIG)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()

    with pytest.raises(ValueError) as exc_info:
        factory.create_team_subgraph("nonexistent-team")

    error_msg = str(exc_info.value)
    assert "nonexistent-team" in error_msg
    assert "general" in error_msg  # at least the default team is listed


# ---------------------------------------------------------------------------
# Invalid subgraph.nodes reference
# ---------------------------------------------------------------------------


def test_invalid_node_reference_raises_value_error(monkeypatch: pytest.MonkeyPatch):
    """Subgraph referencing a non-existent agent raises ValueError."""
    custom_config = {
        "schema_version": "1.0",
        "teams": {
            "broken": {
                "name": "Broken Team",
                "description": "Team with invalid node reference.",
                "agents": [
                    {"name": "valid-agent", "role": "assistant", "model": "auto"},
                ],
                "subgraph": {
                    "type": "sequential",
                    "nodes": ["missing-agent"],
                },
                "routing_keys": ["broken"],
            }
        },
    }

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(custom_config)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()

    with pytest.raises(ValueError) as exc_info:
        factory.create_team_subgraph("broken")

    error_msg = str(exc_info.value)
    assert "missing-agent" in error_msg
    assert "valid-agent" in error_msg


# ---------------------------------------------------------------------------
# Team without subgraph definition (uses agents list as default)
# ---------------------------------------------------------------------------


def test_team_without_subgraph_uses_agents_default(monkeypatch: pytest.MonkeyPatch):
    """Team with no subgraph key falls back to agents list as sequential."""
    custom_config = {
        "schema_version": "1.0",
        "teams": {
            "minimal": {
                "name": "Minimal Team",
                "description": "Team without explicit subgraph.",
                "agents": [
                    {"name": "solo-agent", "role": "assistant", "model": "auto"},
                ],
                "routing_keys": ["minimal"],
            }
        },
    }

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(custom_config)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()
    graph = factory.create_team_subgraph("minimal")

    assert isinstance(graph, StateGraph)
    assert "solo-agent" in graph.nodes
    assert ("__start__", "solo-agent") in graph.edges


# ---------------------------------------------------------------------------
# Agent model "auto" resolution
# ---------------------------------------------------------------------------


def test_auto_model_resolves_to_deepagents_model(monkeypatch: pytest.MonkeyPatch):
    """Agent with model='auto' resolves to settings.deepagents_model."""
    monkeypatch.setattr(
        "app.config.settings.deepagents_model", "openai:gpt-4-test"
    )

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(_BASE_TEAMS_CONFIG)

    captured_kwargs: dict = {}

    def _capturing_create_deep_agent(**kwargs):
        captured_kwargs.update(kwargs)
        mock_agent = MagicMock()

        async def _fake_ainvoke(*args, **input_kwargs):
            return {"messages": []}

        mock_agent.ainvoke = _fake_ainvoke
        return mock_agent

    # Replace create_deep_agent in the stubbed deepagents module
    import deepagents as da_mod  # noqa: F811

    da_mod.create_deep_agent = _capturing_create_deep_agent

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()
    graph = factory.create_team_subgraph("general")

    # Verify the node exists
    assert "general-assistant" in graph.nodes

    # Invoke the node to trigger model resolution and create_deep_agent call
    # Must pass a HumanMessage — the node returns early on empty messages
    node_spec = graph.nodes["general-assistant"]
    node_func = node_spec.runnable.afunc  # async functions use afunc, not func

    async def _invoke():
        return await node_func({"messages": [HumanMessage(content="test query")]})

    asyncio.run(_invoke())

    # Model was resolved from "auto" to deepagents_model
    assert captured_kwargs.get("model") == "openai:gpt-4-test"


# ---------------------------------------------------------------------------
# Export validation
# ---------------------------------------------------------------------------


def test_exports_from_orchestrator_init(monkeypatch: pytest.MonkeyPatch):
    """TeamSubgraphFactory and TeamState are exported from orchestrator __init__."""
    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)

    from app.orchestrator import TeamState, TeamSubgraphFactory

    assert TeamSubgraphFactory is not None
    assert TeamState is not None


# ---------------------------------------------------------------------------
# Edge case tests (Story 5.5)
# ---------------------------------------------------------------------------


def test_empty_agents_list_raises_value_error(monkeypatch: pytest.MonkeyPatch):
    """Team with empty agents list and subgraph referencing nodes raises ValueError.

    The subgraph.nodes references 'only-node', but the agents list is empty.
    The factory detects this when building the sequential subgraph.
    """
    custom_config = {
        "schema_version": "1.0",
        "teams": {
            "empty-agents": {
                "name": "Empty Agents Team",
                "description": "Team with no agents.",
                "agents": [],
                "subgraph": {
                    "type": "sequential",
                    "nodes": ["only-node"],
                },
                "routing_keys": ["empty"],
            }
        },
    }

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(custom_config)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()

    with pytest.raises(ValueError, match="only-node"):
        factory.create_team_subgraph("empty-agents")


def test_duplicate_node_names_raises_value_error(monkeypatch: pytest.MonkeyPatch):
    """subgraph.nodes containing duplicate names raises ValueError with details."""
    custom_config = {
        "schema_version": "1.0",
        "teams": {
            "dup-nodes": {
                "name": "Duplicate Nodes Team",
                "description": "Team with duplicate subgraph nodes.",
                "agents": [
                    {"name": "agent-a", "role": "assistant", "model": "auto"},
                ],
                "subgraph": {
                    "type": "sequential",
                    "nodes": ["agent-a", "agent-a"],
                },
                "routing_keys": ["dup"],
            }
        },
    }

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(custom_config)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()

    with pytest.raises(ValueError, match="duplicates"):
        factory.create_team_subgraph("dup-nodes")


def test_auto_model_missing_deepagents_model_raises_runtime_error(
    monkeypatch: pytest.MonkeyPatch,
):
    """Agent with model='auto' and no deepagents_model configured raises RuntimeError.

    The factory's _create_agent_node resolves 'auto' to settings.deepagents_model.
    When deepagents_model is empty/None, a RuntimeError is raised at graph
    construction time (not at invocation time).
    """
    monkeypatch.setattr("app.config.settings.deepagents_model", None)

    custom_config = {
        "schema_version": "1.0",
        "teams": {
            "no-model": {
                "name": "No Model Team",
                "description": "Team with auto model and no deepagents_model.",
                "agents": [
                    {"name": "auto-agent", "role": "assistant", "model": "auto"},
                ],
                "subgraph": {
                    "type": "sequential",
                    "nodes": ["auto-agent"],
                },
                "routing_keys": ["nomodel"],
            }
        },
    }

    _clear_modules(monkeypatch)
    _stub_deepagents(monkeypatch)
    _patch_teams_config(custom_config)

    from app.orchestrator.team_factory import TeamSubgraphFactory

    factory = TeamSubgraphFactory()

    with pytest.raises(RuntimeError, match="deepagents_model"):
        factory.create_team_subgraph("no-model")
