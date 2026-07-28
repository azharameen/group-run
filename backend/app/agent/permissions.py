"""Filesystem permissions for the DeepAgents runtime."""

try:
    from deepagents import FilesystemPermission
    HAS_DEEPAGENTS = True
except ImportError:
    HAS_DEEPAGENTS = False


def build_agent_permissions():
    """Return path-based rules for agent filesystem access."""
    if not HAS_DEEPAGENTS:
        return []

    return [
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/conversation_history/**", "/large_tool_results/**"],
            mode="allow",
        ),
        FilesystemPermission(
            operations=["read"],
            paths=["/workspace/**", "/kb/**", "/instructions/**", "/skills/**", "/memories/**"],
            mode="allow",
        ),
        FilesystemPermission(
            operations=["write"],
            paths=["/workspace/submissions/**", "/workspace/final/**"],
            mode="interrupt",
        ),
        FilesystemPermission(
            operations=["write"],
            paths=["/workspace/**", "/memories/**"],
            mode="allow",
        ),
        FilesystemPermission(
            operations=["write"],
            paths=["/kb/**", "/instructions/**", "/skills/**"],
            mode="deny",
        ),
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny",
        ),
    ]
