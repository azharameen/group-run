"""Compatibility shim for legacy storage imports.

Phase 1 is splitting the old storage god-module into smaller modules while
keeping the current import surface stable.
"""

from ..config import KNOWLEDGE_BASE_DIR, WORKSPACE_DIR
from .base import read_markdown, read_yaml, write_markdown, write_yaml
from .idea_workspace import (
    archive_idea_folder,
    create_idea_folder,
    delete_idea_folder,
    get_all_idea_files,
    idea_folder_path,
    load_comments,
    load_idea_yaml,
    load_pending_interrupts,
    load_transcript_events,
    save_comment,
    save_idea_yaml,
    save_pending_interrupts,
    save_transcript_event,
    write_changelog_entry,
)
from .knowledge_base import load_knowledge_base
from .recovery import recover_from_filesystem
from .registry import load_idea_registry, remove_from_registry, save_idea_registry

__all__ = [
    "KNOWLEDGE_BASE_DIR",
    "WORKSPACE_DIR",
    "archive_idea_folder",
    "create_idea_folder",
    "delete_idea_folder",
    "get_all_idea_files",
    "idea_folder_path",
    "load_comments",
    "load_idea_registry",
    "load_idea_yaml",
    "load_knowledge_base",
    "load_pending_interrupts",
    "load_transcript_events",
    "read_markdown",
    "read_yaml",
    "recover_from_filesystem",
    "remove_from_registry",
    "save_comment",
    "save_idea_registry",
    "save_idea_yaml",
    "save_pending_interrupts",
    "save_transcript_event",
    "write_changelog_entry",
    "write_markdown",
    "write_yaml",
]

