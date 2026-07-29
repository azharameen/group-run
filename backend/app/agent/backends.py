"""DeepAgents backend configuration."""

from pathlib import Path
from ..config import INSTRUCTIONS_DIR, KNOWLEDGE_BASE_DIR, ROOT_DIR, WORKSPACE_DIR


def build_agent_backend():
    """Build the default DeepAgents backend layout for this project."""
    try:
        from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    except ImportError as exc:
        raise RuntimeError("DeepAgents backend support requires the deepagents package.") from exc

    memories_dir = Path(ROOT_DIR) / "memories"
    skills_dir = Path(ROOT_DIR) / "skills"

    memories_dir.mkdir(parents=True, exist_ok=True)
    skills_dir.mkdir(parents=True, exist_ok=True)

    return CompositeBackend(
        default=StateBackend(),
        routes={
            "/workspace/": FilesystemBackend(root_dir=WORKSPACE_DIR, virtual_mode=True),
            "/kb/": FilesystemBackend(root_dir=KNOWLEDGE_BASE_DIR, virtual_mode=True),
            "/instructions/": FilesystemBackend(root_dir=INSTRUCTIONS_DIR, virtual_mode=True),
            "/memories/": FilesystemBackend(root_dir=str(memories_dir), virtual_mode=True),
            "/skills/": FilesystemBackend(root_dir=str(skills_dir), virtual_mode=True),
        },
    )
