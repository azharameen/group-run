"""JSON Schema validation for configuration files."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

# ── Teams.yaml Schema ───────────────────────────────────────────────────────

TEAMS_YAML_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "teams"],
    "properties": {
        "schema_version": {"type": "string", "enum": ["1.0"]},
        "teams": {
            "type": "object",
            "minProperties": 1,
            "additionalProperties": {
                "type": "object",
                "required": ["name", "description", "agents", "routing_keys"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "description": {"type": "string"},
                    "validation_role": {"type": "string"},
                    "validation_prompt": {"type": "string"},
                    "agents": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["name", "role"],
                            "properties": {
                                "name": {"type": "string", "minLength": 1},
                                "role": {"type": "string", "minLength": 1},
                                "description": {"type": "string"},
                                "model": {"type": "string"},
                            },
                        },
                    },
                    "tools": {
                        "type": "array",
                        "items": {"type": "string"},
                        "default": [],
                    },
                    "subgraph": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["sequential", "parallel", "conditional"],
                            },
                            "nodes": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "routing_keys": {
                        "type": "array",
                        "minItems": 1,
                        "items": {"type": "string"},
                    },
                },
            },
        },
    },
}

# ── mcp.json Schema ─────────────────────────────────────────────────────────

MCP_JSON_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "servers"],
    "properties": {
        "schema_version": {"type": "string", "enum": ["1.0"]},
        "servers": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "transport"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "transport": {"type": "string", "enum": ["http", "stdio"]},
                    "url": {"type": "string"},
                    "command": {"type": "string"},
                    "args": {"type": "array", "items": {"type": "string"}},
                    "timeout": {"type": "integer", "minimum": 1, "maximum": 300},
                    "options": {"type": "object"},
                },
            },
        },
    },
}


def _validate_schema(
    data: Any, schema: dict, source: str
) -> list[str]:
    """Validate data against a simplified JSON Schema.

    Args:
        data: Parsed config data to validate.
        schema: JSON Schema definition.
        source: Config file path for error messages.

    Returns:
        List of validation error messages. Empty list means valid.
    """
    errors: list[str] = []

    if schema["type"] == "object":
        if not isinstance(data, dict):
            return [f"{source}: expected object, got {type(data).__name__}"]

        # Check required fields
        for req in schema.get("required", []):
            if req not in data:
                errors.append(f"{source}: missing required field '{req}'")

        # Check property types
        props = schema.get("properties", {})
        for key, subschema in props.items():
            if key not in data:
                continue
            value = data[key]
            expected_type = subschema.get("type")

            if expected_type == "string":
                if not isinstance(value, str):
                    errors.append(
                        f"{source}.{key}: expected string, got {type(value).__name__}"
                    )
                else:
                    if "minLength" in subschema and len(value) < subschema["minLength"]:
                        errors.append(
                            f"{source}.{key}: length {len(value)} "
                            f"< min {subschema['minLength']}"
                        )
                    if (
                        "enum" in subschema
                        and value not in subschema["enum"]
                    ):
                        errors.append(
                            f"{source}.{key}: value '{value}' "
                            f"not in {subschema['enum']}"
                        )

            elif expected_type == "integer":
                if not isinstance(value, int):
                    errors.append(
                        f"{source}.{key}: expected integer, "
                        f"got {type(value).__name__}"
                    )
                else:
                    if "minimum" in subschema and value < subschema["minimum"]:
                        errors.append(
                            f"{source}.{key}: value {value} "
                            f"< min {subschema['minimum']}"
                        )
                    if "maximum" in subschema and value > subschema["maximum"]:
                        errors.append(
                            f"{source}.{key}: value {value} "
                            f"> max {subschema['maximum']}"
                        )

            elif expected_type == "array":
                if not isinstance(value, list):
                    errors.append(
                        f"{source}.{key}: expected array, "
                        f"got {type(value).__name__}"
                    )
                else:
                    min_items = subschema.get("minItems")
                    if min_items is not None and len(value) < min_items:
                        errors.append(
                            f"{source}.{key}: {len(value)} items "
                            f"< min {min_items}"
                        )

            elif expected_type == "object":
                if not isinstance(value, dict):
                    errors.append(
                        f"{source}.{key}: expected object, "
                        f"got {type(value).__name__}"
                    )
                else:
                    min_props = subschema.get("minProperties")
                    if (
                        min_props is not None
                        and len(value) < min_props
                    ):
                        errors.append(
                            f"{source}.{key}: {len(value)} properties "
                            f"< min {min_props}"
                        )

    return errors


def validate_teams_config(
    data: Any, source: str = "teams.yaml"
) -> list[str]:
    """Validate teams.yaml data against the schema.

    Args:
        data: Parsed YAML data from teams.yaml.
        source: File path for error messages.

    Returns:
        List of validation error messages. Empty list means valid.
    """
    return _validate_schema(data, TEAMS_YAML_SCHEMA, source)


def validate_mcp_config(
    data: Any, source: str = "mcp.json"
) -> list[str]:
    """Validate mcp.json data against the schema.

    Args:
        data: Parsed JSON data from mcp.json.
        source: File path for error messages.

    Returns:
        List of validation error messages. Empty list means valid.
    """
    return _validate_schema(data, MCP_JSON_SCHEMA, source)


def load_and_validate_teams(path: str) -> tuple[dict, list[str]]:
    """Load and validate teams.yaml from disk.

    Args:
        path: Absolute or relative path to teams.yaml.

    Returns:
        Tuple of (parsed data dict, error list). Data is empty dict
        if loading fails.
    """
    p = Path(path)
    if not p.exists():
        return {}, [f"File not found: {path}"]
    try:
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return {}, [f"YAML parse error in {path}: {exc}"]
    if not data or not isinstance(data, dict):
        return {}, ["File is empty or not a valid YAML object."]
    errors = validate_teams_config(data, path)
    return data or {}, errors


def load_and_validate_mcp(path: str) -> tuple[dict, list[str]]:
    """Load and validate mcp.json from disk.

    Args:
        path: Absolute or relative path to mcp.json.

    Returns:
        Tuple of (parsed data dict, error list). Data is empty dict
        if loading fails.
    """
    p = Path(path)
    if not p.exists():
        return {}, [f"File not found: {path}"]
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, [f"JSON parse error in {path}: {exc}"]
    if not data or not isinstance(data, dict):
        return {}, ["File is empty or not a valid JSON object."]
    errors = validate_mcp_config(data, path)
    return data or {}, errors
