import pytest
from unittest.mock import patch
from app.agent.subagents import build_agent_subagents
from app.config import settings
import logging


@pytest.fixture
def mock_yaml_safe_load():
    with patch("app.agent.subagents.yaml.safe_load") as mock_load:
        with patch("app.agent.subagents.Path.read_text", return_value="dummy"):
            yield mock_load


def test_build_agent_subagents_happy_path(mock_yaml_safe_load):
    mock_yaml_safe_load.return_value = {
        "teams": {"general": {"description": "General team.", "agents": [{"name": "Agent1"}]}}
    }
    subagents = build_agent_subagents("general")
    assert len(subagents) == 1
    assert subagents[0]["name"] == "Agent1"
    assert subagents[0]["role"] == "assistant"
    assert subagents[0]["model"] == settings.deepagents_model
    assert subagents[0]["system_prompt"] == "General team. You are Agent1."
    assert subagents[0]["description"] == "assistant"
    assert subagents[0]["skills"] == ["/skills/"]
    assert subagents[0]["memories"] == ["/memories/"]


def test_build_agent_subagents_missing_name(mock_yaml_safe_load, caplog):
    mock_yaml_safe_load.return_value = {"teams": {"general": {"agents": [{"role": "assistant"}]}}}
    with caplog.at_level(logging.WARNING):
        subagents = build_agent_subagents("general")

    assert len(subagents) == 0
    assert "Agent entry missing 'name'" in caplog.text


def test_build_agent_subagents_explicit_values(mock_yaml_safe_load):
    mock_yaml_safe_load.return_value = {
        "teams": {
            "general": {
                "agents": [
                    {
                        "name": "Agent2",
                        "role": "expert",
                        "model": "gpt-4",
                        "system_prompt": "Custom prompt.",
                        "description": "Custom description.",
                        "skills": ["custom_skill"],
                        "memories": ["custom_memory"],
                    }
                ]
            }
        }
    }
    subagents = build_agent_subagents("general")
    assert len(subagents) == 1
    assert subagents[0]["name"] == "Agent2"
    assert subagents[0]["role"] == "expert"
    assert subagents[0]["model"] == "gpt-4"
    assert subagents[0]["system_prompt"] == "Custom prompt."
    assert subagents[0]["description"] == "Custom description."
    assert subagents[0]["skills"] == ["custom_skill"]
    assert subagents[0]["memories"] == ["custom_memory"]


def test_build_agent_subagents_missing_team(mock_yaml_safe_load):
    mock_yaml_safe_load.return_value = {"teams": {}}
    subagents = build_agent_subagents("missing_team")
    assert len(subagents) == 0
