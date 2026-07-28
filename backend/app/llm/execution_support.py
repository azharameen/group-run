"""Shared helpers for LLM-driven workflow execution."""

import json
import os
from typing import Any

from ..config import INSTRUCTIONS_DIR, KNOWLEDGE_BASE_DIR
from ..storage.yaml_io import idea_folder_path, load_idea_registry, load_knowledge_base, read_yaml, write_markdown, write_yaml
from .client import call_llm_json


SYSTEM_BASE = (
    "You are a senior patent analyst at Siemens, a global technology company. "
    "You evaluate invention ideas with rigorous, structured reasoning. "
    "Your responses are detailed, technically precise, and formatted for patent workflow automation."
)


def normalize_key(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum() or ch.isspace()).strip()


def truncate(text: str, limit: int = 700) -> str:
    text = text.strip()
    return text if len(text) <= limit else f"{text[:limit].rstrip()}..."


def stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, (dict, list)):
        return json.dumps(content, indent=2, default=str)
    return str(content)


def read_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def load_autonomous_context() -> dict[str, Any]:
    docs = load_knowledge_base()
    registry = load_idea_registry()
    recent_ideas = registry.get("ideas", [])[-10:]

    tech_domains_path = os.path.join(KNOWLEDGE_BASE_DIR, "siemens", "tech_domains.yaml")
    tech_domains = read_yaml(tech_domains_path) if os.path.exists(tech_domains_path) else {}

    instructions = []
    for name in ("global-agent-instructions.md", "siemens-validator-instructions.md"):
        path = os.path.join(INSTRUCTIONS_DIR, name)
        if os.path.exists(path):
            instructions.append(
                {
                    "path": name,
                    "content": truncate(read_text_file(path), 1200),
                }
            )

    return {
        "documents": docs,
        "recent_ideas": recent_ideas,
        "tech_domains": tech_domains,
        "instructions": instructions,
    }


def render_context_summary(context: dict[str, Any], max_documents: int = 12) -> str:
    docs = context.get("documents", [])[:max_documents]
    recent_ideas = context.get("recent_ideas", [])
    tech_domains = context.get("tech_domains", {})
    instructions = context.get("instructions", [])

    parts = ["## Siemens Tech Domains", truncate(stringify_content(tech_domains), 1400)]

    if instructions:
        parts.append("## Operating Instructions")
        for item in instructions:
            parts.append(f"- {item['path']}: {item['content']}")

    parts.append("## Knowledge Base Documents")
    if docs:
        for doc in docs:
            parts.append(
                f"- [{doc.get('source')}] {doc.get('path')}: {truncate(stringify_content(doc.get('content', '')), 1000)}"
            )
    else:
        parts.append("- No raw or processed documents found yet.")

    if recent_ideas:
        parts.append("## Recent Ideas To Avoid Duplicating")
        for idea in recent_ideas:
            parts.append(
                f"- {idea.get('idea_id', '')}: {idea.get('title', '')} | {idea.get('state', '')} | {idea.get('phase', '')}"
            )

    return "\n".join(parts)


def ensure_idea_folder(idea_id: str) -> dict:
    path = os.path.join(idea_folder_path(idea_id), "idea.yaml")
    try:
        return read_yaml(path) or {}
    except FileNotFoundError:
        return {}


def write_idea_field(idea_id: str, field: str, value: Any) -> None:
    data = ensure_idea_folder(idea_id)
    data[field] = value
    write_yaml(os.path.join(idea_folder_path(idea_id), "idea.yaml"), data)


def write_markdown_file(idea_id: str, filename: str, content: str) -> None:
    write_markdown(os.path.join(idea_folder_path(idea_id), filename), content)


def call_llm_json_with_fallback(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    fallback_factory,
    max_retries: int = 2,
):
    """Call the LLM with retry logic, then return fallback data if needed."""
    last_error = None
    for attempt in range(1 + max_retries):
        try:
            result = call_llm_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if result:
                return result
            last_error = "Empty result from LLM"
        except Exception as exc:
            last_error = exc
            if attempt < max_retries:
                continue

    fallback = fallback_factory()
    fallback["_fallback"] = True
    fallback["_fallback_reason"] = str(last_error)
    return fallback
