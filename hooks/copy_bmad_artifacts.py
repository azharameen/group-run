"""MkDocs build hook: copies BMad artifacts from _bmad-output/ into docs/
at build time only. Nothing is ever committed to git."""

import glob
import os
import shutil

BMAD_OUTPUT = "_bmad-output"
DOCS_DIR = "docs"


def on_pre_build(config):
    """Called by MkDocs before the build starts."""
    _copy_architecture_spine()
    _copy_planning_artifacts()
    _copy_project_context()
    _copy_community_files()
    _cleanup_readme_conflict()


def _copy_community_files():
    """Copy root CHANGELOG, CONTRIBUTING, LICENSE files into docs/."""
    for filename in ["CHANGELOG.md", "CONTRIBUTING.md", "LICENSE.md"]:
        if os.path.exists(filename):
            shutil.copy2(filename, os.path.join(DOCS_DIR, filename))
            print(f"[docs-hook] Copied {filename} to docs/")


def _cleanup_readme_conflict():
    """Remove docs/README.md if docs/index.md exists to avoid conflict warning."""
    readme = os.path.join(DOCS_DIR, "README.md")
    index = os.path.join(DOCS_DIR, "index.md")
    if os.path.exists(readme) and os.path.exists(index):
        os.remove(readme)
        print("[docs-hook] Removed docs/README.md to avoid conflict with docs/index.md")


def _copy_architecture_spine():
    """Discover and copy all ARCHITECTURE-SPINE.md files (most recent wins)."""
    pattern = os.path.join(BMAD_OUTPUT, "planning-artifacts", "architecture", "**", "ARCHITECTURE-SPINE.md")
    files = glob.glob(pattern, recursive=True)
    dest_dir = os.path.join(DOCS_DIR, "architecture")
    os.makedirs(dest_dir, exist_ok=True)
    if files:
        latest = sorted(files)[-1]
        shutil.copy2(latest, os.path.join(dest_dir, "spine.md"))
        print(f"[docs-hook] Copied architecture spine: {latest}")
    else:
        placeholder = os.path.join(dest_dir, "spine.md")
        if not os.path.exists(placeholder):
            with open(placeholder, "w") as f:
                f.write("# Architecture Spine\n\n> No BMad architecture spine generated yet. Run the `bmad-architecture` skill to create one.\n")


def _copy_planning_artifacts():
    """Copy epics overview and all sprint plans."""
    dest_dir = os.path.join(DOCS_DIR, "epics")
    os.makedirs(dest_dir, exist_ok=True)

    epics_src = os.path.join(BMAD_OUTPUT, "planning-artifacts", "epics.md")
    if os.path.exists(epics_src):
        shutil.copy2(epics_src, os.path.join(dest_dir, "index.md"))
        print("[docs-hook] Copied epics overview")
    else:
        _ensure_placeholder(os.path.join(dest_dir, "index.md"), "# Epics Overview", "No epics file generated yet.")

    sprint_files = glob.glob(os.path.join(BMAD_OUTPUT, "planning-artifacts", "sprint-*.md"))
    for f in sorted(sprint_files):
        dest = os.path.join(dest_dir, os.path.basename(f))
        shutil.copy2(f, dest)
        print(f"[docs-hook] Copied sprint plan: {os.path.basename(f)}")

    if not sprint_files:
        _ensure_placeholder(os.path.join(dest_dir, "sprint-1.md"), "# Sprint 1", "No sprint plan generated yet.")


def _copy_project_context():
    """Copy project-context.md into docs/context/."""
    dest_dir = os.path.join(DOCS_DIR, "context")
    os.makedirs(dest_dir, exist_ok=True)

    src = os.path.join(BMAD_OUTPUT, "project-context.md")
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(dest_dir, "project-context.md"))
        print("[docs-hook] Copied project context")
    else:
        _ensure_placeholder(
            os.path.join(dest_dir, "project-context.md"),
            "# Project Context",
            "No project-context.md generated yet. Run `bmad-generate-project-context`.",
        )


def _ensure_placeholder(path: str, title: str, message: str):
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(f"{title}\n\n> {message}\n")
