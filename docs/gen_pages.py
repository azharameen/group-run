"""Generate documentation indexes from repository automation."""

from pathlib import Path

import mkdocs_gen_files


def workflow_name(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip().strip('"')
    return path.stem


workflows = sorted(Path(".github/workflows").glob("*.yml"))
with mkdocs_gen_files.open("generated/workflows.md", "w") as page:
    page.write("# Automation Index\n\n")
    page.write(
        "This page is generated from `.github/workflows/` during every MkDocs "
        "build. Use it as the source map for repository automation.\n\n"
    )
    page.write("| Workflow | Source | Purpose |\n|---|---|---|\n")
    for path in workflows:
        name = workflow_name(path)
        source = f"[`{path.as_posix()}`](https://github.com/azharameen/group-run/blob/develop/{path.as_posix()})"
        page.write(f"| {name} | {source} | [Open workflow docs](../cicd/overview.md) |\n")
