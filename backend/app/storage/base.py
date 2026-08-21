"""Base YAML and markdown I/O helpers."""

import os
import tempfile
from typing import Any

import yaml


def read_yaml(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def _check_safe_path(path: str) -> str:
    if ".." in path or "\x00" in path:
        raise ValueError(f"Unsafe path detected: {path}")
    return os.path.abspath(path)


def write_yaml(path: str, data: Any):
    abs_path = _check_safe_path(path)
    dir_name = os.path.dirname(abs_path)
    os.makedirs(dir_name, exist_ok=True)
    tmp_file = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as handle:
            tmp_file = handle.name
            yaml.dump(data, handle, default_flow_style=False, allow_unicode=True, sort_keys=False)
        os.replace(tmp_file, abs_path)
    except Exception:
        if tmp_file and os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError:
                pass
        raise


def read_markdown(path: str) -> str:
    return open(_check_safe_path(path), "r", encoding="utf-8").read()


def write_markdown(path: str, content: str):
    abs_path = _check_safe_path(path)
    dir_name = os.path.dirname(abs_path)
    os.makedirs(dir_name, exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as handle:
        handle.write(content)
