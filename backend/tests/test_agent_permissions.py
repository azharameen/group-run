import pytest
import sys
from unittest.mock import patch

from app.agent.permissions import build_agent_permissions
from deepagents import FilesystemPermission

def test_build_agent_permissions_success():
    """Test that build_agent_permissions returns the expected list of permissions."""
    permissions = build_agent_permissions()

    assert isinstance(permissions, list)
    assert len(permissions) == 6
    assert all(isinstance(p, FilesystemPermission) for p in permissions)

    # Check a couple of specific permissions to ensure content is correct
    assert permissions[0].operations == ["read", "write"]
    assert permissions[0].paths == ["/conversation_history/**", "/large_tool_results/**"]
    assert permissions[0].mode == "allow"

    assert permissions[-1].operations == ["read", "write"]
    assert permissions[-1].paths == ["/**"]
    assert permissions[-1].mode == "deny"

def test_build_agent_permissions_import_error():
    """Test that build_agent_permissions raises RuntimeError if deepagents is missing."""
    with patch.dict(sys.modules, {'deepagents': None}):
        with pytest.raises(RuntimeError, match="DeepAgents filesystem permissions require the deepagents package."):
            build_agent_permissions()
