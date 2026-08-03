"""Check for forbidden imports from deleted modules.

EP-0 (Technical Prerequisite): These modules were removed during the
Patent Ideator -> Agentic Organization Platform migration.
This script prevents dead code from re-entering the codebase.

Exit code 0 = clean (no violations)
Exit code 1 = violations found
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Forbidden module patterns (relative paths to scan)
# ---------------------------------------------------------------------------
FORBIDDEN_PATTERNS = [
    # Backend app/ patterns -- these entire modules were deleted
    # Both 'from' and direct 'import' forms
    r"from app\.state\b",
    r"import app\.state\b",
    r"from app\.scoring\b",
    r"import app\.scoring\b",
    r"from app\.research\b",
    r"import app\.research\b",
    r"from app\.orchestrator\b",
    r"import app\.orchestrator\b",
    r"from app\.scheduler\b",
    r"import app\.scheduler\b",
    r"from app\.llm\.execution_support\b",
    r"import app\.llm\.execution_support\b",
    r"from app\.llm\.subagent_executor\b",
    r"import app\.llm\.subagent_executor\b",
    r"from app\.application\.queries\.workflow_status\b",
    r"import app\.application\.queries\.workflow_status\b",
    # Bare imports of third-party packages that were removed
    r"from transitions\b",
    r"import transitions\b",
    r"from apscheduler\b",
    r"import apscheduler\b",
]

# Combined pattern for efficiency
_COMBINED = re.compile("|".join(f"(?:{p})" for p in FORBIDDEN_PATTERNS))

# Directories to scan (relative to project root)
SCAN_DIRS = ["backend/app", "backend/tests", "scripts"]


def find_violations(project_root: Path) -> list[tuple[Path, int, str]]:
    """Return list of (file, line_no, line_text) for each violation."""
    violations: list[tuple[Path, int, str]] = []
    scan_paths = [project_root / d for d in SCAN_DIRS]

    for scan_path in scan_paths:
        if not scan_path.is_dir():
            print(f"[WARN] Scan directory not found: {scan_path}", file=sys.stderr)
            continue
        has_py_files = False
        scanned = False
        for py_file in scan_path.rglob("*.py"):
            has_py_files = True
            # Exclude this script itself (contains forbidden terms in pattern strings)
            if py_file.name == "forbidden_imports.py":
                continue
            scanned = True
            try:
                content = py_file.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            for lineno, raw_line in enumerate(content.splitlines(), start=1):
                if _COMBINED.search(raw_line):
                    violations.append((py_file, lineno, raw_line.strip()))
        if not has_py_files:
            print(f"[WARN] No .py files found in: {scan_path}", file=sys.stderr)

    return violations


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    violations = find_violations(project_root)

    if not violations:
        print("[PASS] No forbidden imports found - codebase is clean.")
        return 0

    print(f"[FAIL] Found {len(violations)} forbidden import(s):\n")
    for filepath, lineno, line_text in violations:
        rel = filepath.relative_to(project_root)
        print(f"  {rel}:{lineno}: {line_text}")

    print("\n[ERROR] These modules were removed during EP-0 migration.")
    print("  Remove the offending import(s) to fix.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
