"""DeepAgents backend configuration."""

import logging
from pathlib import Path

from ..config import INSTRUCTIONS_DIR, KNOWLEDGE_BASE_DIR, ROOT_DIR, WORKSPACE_DIR


def build_agent_backend():
    """Build the default DeepAgents backend layout for this project."""
    try:
        from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    except ImportError:
        # Graceful fallback for test environments without deepagents installed
        logger = logging.getLogger(__name__)
        logger.warning("DeepAgents not found, using Mock backend for discovery")
        class MockBackend:
            def __init__(self, *args, **kwargs): pass
            def __call__(self, *args, **kwargs): return self
            def ls(self, *args, **kwargs): return type('Result', (), {'error': 'Mock', 'entries': []})
            def read(self, *args, **kwargs): return type('Result', (), {'error': 'Mock', 'file_data': None})
            def write(self, *args, **kwargs): return type('Result', (), {'error': 'Mock'})
        return MockBackend()

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
