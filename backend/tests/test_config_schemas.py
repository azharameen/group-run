from app.config_schemas import load_and_validate_teams


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
