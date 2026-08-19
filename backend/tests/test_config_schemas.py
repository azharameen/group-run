import json

from app.config_schemas import load_and_validate_mcp, load_and_validate_teams


def test_load_and_validate_teams_missing_file(tmp_path):
    path = tmp_path / "does_not_exist.yaml"
    data, errors = load_and_validate_teams(str(path))
    assert data == {}
    assert len(errors) == 1
    assert "File not found" in errors[0]


def test_load_and_validate_teams_invalid_yaml(tmp_path):
    path = tmp_path / "invalid.yaml"
    path.write_text('["unbalanced: {', encoding="utf-8")

    data, errors = load_and_validate_teams(str(path))

    assert data == {}
    assert len(errors) == 1
    assert "YAML parse error" in errors[0]


def test_load_and_validate_teams_empty_file(tmp_path):
    path = tmp_path / "empty.yaml"
    path.write_text("", encoding="utf-8")

    data, errors = load_and_validate_teams(str(path))

    assert data == {}
    assert len(errors) == 1
    assert "File is empty or not a valid YAML object." in errors[0]


def test_load_and_validate_mcp_missing_file(tmp_path):
    path = tmp_path / "does_not_exist.json"
    data, errors = load_and_validate_mcp(str(path))
    assert data == {}
    assert len(errors) == 1
    assert "File not found" in errors[0]


def test_load_and_validate_mcp_invalid_json(tmp_path):
    path = tmp_path / "invalid.json"
    path.write_text('{"unbalanced: [', encoding="utf-8")

    data, errors = load_and_validate_mcp(str(path))

    assert data == {}
    assert len(errors) == 1
    assert "JSON parse error" in errors[0]


def test_load_and_validate_mcp_invalid_schema(tmp_path):
    path = tmp_path / "invalid_schema.json"
    # Missing required 'servers'
    invalid_data = {"schema_version": "1.0"}
    path.write_text(json.dumps(invalid_data), encoding="utf-8")

    data, errors = load_and_validate_mcp(str(path))

    assert data == invalid_data
    assert len(errors) > 0
    assert any("servers" in err for err in errors)


def test_load_and_validate_mcp_valid(tmp_path):
    path = tmp_path / "valid.json"
    valid_data = {
        "schema_version": "1.0",
        "servers": [{"name": "test-server", "transport": "stdio", "command": "python", "args": ["-m", "test_server"]}],
    }
    path.write_text(json.dumps(valid_data), encoding="utf-8")

    data, errors = load_and_validate_mcp(str(path))

    assert data == valid_data
    assert len(errors) == 0
