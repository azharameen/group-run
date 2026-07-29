"""DeepAgents runtime factory."""

from pathlib import Path
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


def get_deep_agent_runtime():
    """Return a compiled DeepAgents graph."""
    if not settings.deepagents_model:
        raise RuntimeError("DeepAgents model configuration is required.")

    from deepagents import create_deep_agent
    from langgraph.checkpoint.memory import InMemorySaver

    interrupt_on = {
        "write_file": True,
        "edit_file": True,
        "delete": True,
    }

    return create_deep_agent(
        model=settings.deepagents_model,
        system_prompt=_load_system_prompt(),
        backend=build_agent_backend(),
        permissions=build_agent_permissions(),
        subagents=build_agent_subagents(),
        context_schema=DeepAgentContext,
        interrupt_on=interrupt_on,
        checkpointer=InMemorySaver(),
        name="siemens-patent-ideator",
    )
