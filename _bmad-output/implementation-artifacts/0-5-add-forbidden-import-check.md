---
baseline_commit: da643c5f96d6d7afe617ca8dae2f4060fe875536
---

# Story 0.5: Add Forbidden Import Check

Status: done

## Story

As a developer who just cleaned up dead code,
I want a script that checks for forbidden imports and fails the build if any are detected,
so that dead code cannot re-enter the codebase through accidental imports of deleted modules.

## Acceptance Criteria

1. `scripts/forbidden_imports.py` exists and can be run from the project root
2. The script checks `backend/app/` for imports of: `state.`, `scoring.`, `research.`, `orchestrator.`, `scheduler`, `siemens`, `execution_support`, `subagent_executor`, `workflow_status`
3. The script exits with code 1 if any forbidden imports are found, and prints the file path and line
4. The script exits with code 0 if no forbidden imports are found
5. Running the script on the current codebase returns zero violations (clean run)
6. `backend/requirements.txt` no longer lists `transitions` or `apscheduler` as dependencies

## Tasks / Subtasks

- [x] Task 1: Create `scripts/forbidden_imports.py` (AC: #1-#4)
  - [x] Create `scripts/` directory if it doesn't exist
  - [x] Implement script that scans `backend/app/` Python files
  - [x] Check for forbidden import patterns (both `from` and `import` statements)
  - [x] Print violations with file path and line number
  - [x] Exit with code 1 on violations, 0 on clean

- [x] Task 2: Verify clean run on current codebase (AC: #5)
  - [x] Run script against current codebase
  - [x] Verify zero violations and exit code 0

- [x] Task 3: Verify requirements.txt is clean (AC: #6)
  - [x] Check `backend/requirements.txt` for `transitions` and `apscheduler`
  - [x] Confirmed: neither present (cleaned in ST-0.1)

## Dev Notes

### Critical Context

This is **EP-0 (Technical Prerequisite)**, the final story (5 of 5). This script will serve as a CI gate to prevent dead code regression.

### Previous Story Intelligence

From ST-0.1: `transitions` and `apscheduler` were removed from `requirements.txt`. Verify they're gone.

### Script Design

- Scan `backend/app/` recursively for `.py` files
- Use regex to match forbidden import patterns
- Forbidden modules: `app.state`, `app.scoring`, `app.research`, `app.orchestrator`, `app.scheduler`, `app.llm.execution_support`, `app.llm.subagent_executor`, `app.application.queries.workflow_status`
- Also check for bare `import transitions` and `import apscheduler`
- Print each violation as: `<file>:<line>: <import statement>`
- Summary at end with violation count and exit code

### References

- [Source: _bmad-output/planning-artifacts/epics.md#EP-0] — NFR-A12: Forbidden import check
- [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules] — deprecated modules list

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b (Copilot CLI)

### Debug Log References

- Baseline commit: `da643c5f96d6d7afe617ca8dae2f4060fe875536`
- Script run: `python scripts/forbidden_imports.py` — exit code 0, zero violations
- Requirements check: `transitions` and `apscheduler` not present in `backend/requirements.txt`

### Completion Notes List

- Task 1: Created `scripts/forbidden_imports.py` — scans `backend/app/` for 14 forbidden import patterns covering all deleted EP-0 modules. ASCII-safe output for Windows console compatibility.
- Task 2: Ran script against current codebase — zero violations, exit code 0.
- Task 3: Verified `backend/requirements.txt` — `transitions` and `apscheduler` already removed (ST-0.1).

### Review Findings

- [x] [Review][Patch] `import app.X` patterns added [scripts/forbidden_imports.py:19-42] — now catches both `from` and direct `import` forms
- [x] [Review][Patch] SCAN_DIRS expanded to include tests and scripts [scripts/forbidden_imports.py:49]
- [x] [Review][Patch] Fail-open guard added [scripts/forbidden_imports.py:58-76] — warnings for missing dirs, self-exclusion avoids false positives
- [x] [Review][Defer] Pre-existing pytest failures (6 HITL/KB 404s) — not caused by EP-0, outside scope

### Change Log

- 2026-08-03: Applied 3 code review patches — expanded import patterns, widened scan dirs, added fail-open guard

### File List

- `scripts/forbidden_imports.py` — new file (forbidden import checker)
