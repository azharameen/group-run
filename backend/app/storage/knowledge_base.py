"""Knowledge-base persistence helpers."""

import os

from ..config import KNOWLEDGE_BASE_DIR
from .base import read_markdown, read_yaml


def _load_documents_from_dir(root: str, source: str) -> list[dict]:
    docs: list[dict] = []
    if not os.path.exists(root):
        return docs

    for dirpath, _, filenames in os.walk(root):
        for filename in sorted(filenames):
            if not filename.endswith((".md", ".yaml", ".yml", ".txt")):
                continue

            file_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(file_path, KNOWLEDGE_BASE_DIR).replace("\\", "/")
            if filename.endswith((".md", ".txt")):
                content = read_markdown(file_path)
            else:
                content = read_yaml(file_path)
            docs.append(
                {
                    "source": source,
                    "path": rel_path,
                    "filename": filename,
                    "content": content,
                }
            )
    return docs


def load_knowledge_base() -> list[dict]:
    docs: list[dict] = []
    docs.extend(_load_documents_from_dir(os.path.join(KNOWLEDGE_BASE_DIR, "raw"), "raw"))
    docs.extend(_load_documents_from_dir(os.path.join(KNOWLEDGE_BASE_DIR, "processed"), "processed"))
    return docs
