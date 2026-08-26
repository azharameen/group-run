"""Base YAML and markdown I/O helpers."""

import os
import tempfile
import time
from typing import Any

import yaml


def _replace_atomically(tmp_file: str, path: str) -> None:
    """Replace a workspace file, tolerating transient Windows file locks."""
    attempts = 1 if os.name != "nt" else 8
    for attempt in range(attempts):
        try:
            os.replace(tmp_file, path)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.025 * (2**attempt))


def read_yaml(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def write_yaml(path: str, data: Any):
    dir_name = os.path.dirname(path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    tmp_file = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=dir_name or ".", delete=False, encoding="utf-8") as handle:
            tmp_file = handle.name
            yaml.dump(data, handle, default_flow_style=False, allow_unicode=True, sort_keys=False)
        _replace_atomically(tmp_file, path)
    except Exception:
        if tmp_file and os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError:
                pass
        raise


def read_markdown(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def write_markdown(path: str, content: str):
    dir_name = os.path.dirname(path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    tmp_file = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=dir_name or ".", delete=False, encoding="utf-8") as handle:
            tmp_file = handle.name
            handle.write(content)
        _replace_atomically(tmp_file, path)
    except Exception:
        if tmp_file and os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError:
                pass
        raise
