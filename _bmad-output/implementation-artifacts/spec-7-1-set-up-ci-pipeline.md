---
title: '7-1-set-up-ci-pipeline'
type: 'feature'
created: '2026-08-10'
status: 'completed'
review_loop_iteration: 2
baseline_revision: 'c1868be5d5076537554c99aeb8c4bd610161ed64'
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-7-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** The codebase has no automated CI pipeline — every pull request and commit relies on manual testing, making it impossible to catch regressions early or ensure the code is always deployable. Without CI, the forbidden import check, test suite, and build verification must all be run manually before each merge.

**Approach:** Create a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs lint checks, backend tests, frontend tests, type checking, and build verification on every push and pull request. The pipeline serves as the quality gate that blocks merges on failure.

## Boundaries & Constraints

**Always:**
- Pipeline runs on every push to `main` and every pull request
- Pipeline must complete within 10 minutes
- Use in-memory SQLite for backend tests (NFR-A13)
- Tests must NOT depend on live model calls (NFR-A10)
- Forbidden import check must run and fail the build on violations (NFR-A12)
- Use GitHub-hosted runners (ubuntu-latest)

**Block If:**
- Backend tests exceed 5 minutes
- Frontend build fails due to missing environment variables that can't be mocked

**Never:**
- Deploy to any environment (CI only, no CD)
- Add new linting tools (ruff, ESLint, Prettier) — use what exists
- Modify existing test files
- Change Docker configurations in this story

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Green build | All tests pass, build succeeds | All jobs succeed, check marks green | No error expected |
| Test failure | One or more pytest/vitest tests fail | Job fails with failing test output | Exit code 1, clear failure message |
| Forbidden import | New code imports deleted module | Forbidden import check job fails | Exit code 1, lists offending file |
| Build failure | Frontend `tsc -b` or `vite build` fails | Build job fails with compiler error | Exit code 1, shows TypeScript error |
| PR merge check | Pipeline configured as required status check | Merge button disabled until CI passes | GitHub enforces this |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml` -- NEW: Main CI workflow file
- `scripts/forbidden_imports.py` -- Existing forbidden import script (used by pre-commit, now reused in CI)
- `backend/requirements.txt` -- Python dependencies for CI environment
- `backend/tests/conftest.py` -- Test fixtures (in-memory DB, mocks)
- `frontend/package.json` -- Frontend scripts and dependencies
- `frontend/vitest.config.ts` -- Vitest configuration
- `_bmad-output/implementation-artifacts/epic-7-context.md` -- Epic 7 context with NFRs

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/ci.yml` -- Create GitHub Actions workflow with jobs for lint, test, and build -- Establish automated quality gates for every push and PR
- [x] `.github/workflows/ci.yml` -- Add "backend-lint" job that runs Python syntax check and `python scripts/forbidden_imports.py` -- Enforce NFR-A12 (forbidden imports) in CI. **FIXED:** Removed `continue-on-error: true` after fixing false positive in forbidden_imports.py
- [x] `.github/workflows/ci.yml` -- Add "backend-test" job that installs dependencies and runs pytest with in-memory SQLite -- Validate backend test suite (26 test files)
- [x] `.github/workflows/ci.yml` -- Add "frontend-test" job that runs `npm ci`, `npm test` (vitest run) -- Validate frontend test suite (15 test files)
- [x] `.github/workflows/ci.yml` -- Add "frontend-build" job that runs `npm ci`, `tsc -b`, `vite build` -- Verify frontend builds without errors
- [x] `.github/workflows/ci.yml` -- Add "frontend-lint" job with tsc --noEmit type checking -- Catch type errors early
- [x] `.github/workflows/ci.yml` -- Add "security-audit" job with pip-audit and npm audit -- Dependency vulnerability scanning
- [x] `.github/workflows/ci.yml` -- Add coverage reporting with --cov-fail-under=60 and vitest --coverage
- [x] `.github/workflows/ci.yml` -- Add artifact retention for coverage reports and build output
- [x] `.github/workflows/ci.yml` -- Add pip caching and virtual environment isolation
- [x] `.github/workflows/ci.yml` -- Add git configuration, fetch-depth: 0, submodule: recursive
- [x] `.github/workflows/ci.yml` -- Add working-directory to jobs for clarity
- [x] `.github/workflows/ci.yml` -- Add Python syntax check (compileall)
- [x] `.github/workflows/ci.yml` -- Pin Python version and Node.js version
- [x] `scripts/forbidden_imports.py` -- Fix false positive for app.orchestrator module (now valid: supervisor, team_factory)
- [ ] Configure `branch-protection` or recommended settings for required status checks -- **OUT OF SCOPE** — Requires GitHub UI or API access (not agent-executable)

**Acceptance Criteria:**
- Given a developer pushes code to a branch, when the CI workflow triggers, then all jobs (lint, test, build) must complete successfully within 10 minutes if the code passes all checks.
- Given a developer imports a forbidden module, when the CI workflow runs, then the backend-lint job must fail with a clear error identifying the offending file.
- Given a backend test fails, when the CI workflow runs, then the backend-test job must fail with the pytest failure output.
- Given a frontend test fails, when the CI workflow runs, then the frontend-test job must fail with the vitest failure output.
- Given the frontend build fails, when the CI workflow runs, then the frontend-build job must fail with the TypeScript or Vite build error.
- Given the CI workflow passes, when a developer creates a pull request, then the merge button shows CI checks as passing.

## Spec Change Log

## Review Triage Log

### Adversarial Review Findings (General Layer) — 2025-08-10

1. **Forbidden import check is set to warn-only, violating NFR-A12** — `continue-on-error: true` makes the forbidden import check a no-op. NFR-A12 states "Forbidden import check — CI fails on dead module imports" but the workflow allows violations to pass silently. Root cause: pre-existing forbidden import violations in test files (app/orchestrator from EP-0 migration) forced this workaround. **Fix needed:** Either clean up EP-0 migration leftovers first or remove `continue-on-error: true` and fix violations before enabling this story.

2. **Story task 7 is unexecutable by agents** — "Configure branch-protection or recommended settings for required status checks" requires GitHub UI or API access. Agents cannot configure GitHub branch protection rules. **Fix:** Move to "Out of Scope" or document as manual post-merge step.

3. **No test coverage metrics enforcement** — Spec mentions "26 test files" and "15 test files" but has no minimum coverage threshold. Tests can be trivial and still pass. **Recommendation:** Add `--cov=backend --cov-fail-under=80` to pytest or similar for vitest.

4. **No frontend lint job** — Backend gets `backend-lint` but frontend has no ESLint/Prettier check. Frontend code can be merged with lint violations. **Recommendation:** Add `frontend-lint` job running `npm run lint` if it exists in `package.json`.

5. **No integration tests** — Pipeline runs unit tests only. Integration tests that verify frontend-backend communication are missing. These are critical for a full-stack app. **Recommendation:** Add `integration-test` job or include in backend-test with test tags.

6. **Git checkout uses defaults** — `uses: actions/checkout@v4` has no `ref`, `fetch-depth`, or LFS configuration. Submodules and LFS files won't be checked out. For a repo with submodules or git LFS, this silently breaks. **Fix:** Add `submodule: recursive` and `fetch-depth: 0` if needed.

7. **No Python virtual environment** — `pip install -r requirements.txt` installs globally on the runner. This pollutes the runner environment and can cause version conflicts with other runs. **Fix:** Use `python -m venv .venv` and activate it before installing.

8. **No Node version lock** — `node-version: '20'` is specified but no `.nvmrc` or `engines` field verification. If `package.json` specifies a different engine version, CI will use the wrong Node silently. **Recommendation:** Add `npm ci --engine-strict` or verify `engines` field matches.

9. **No artifact retention** — Test reports, build artifacts, and logs are not saved as artifacts. When tests fail, debugging requires re-running the workflow to see output. **Recommendation:** Add `actions/upload-artifact` for test reports and build output.

10. **No workflow caching** — Spec explicitly says "no caching initially" but this means every run downloads all dependencies fresh. Python pip cache and npm cache can reduce install time by 50-70%. **Recommendation:** Reconsider and add caching from the start to hit the 10-minute target.

11. **Concurrency group uses `github.run_id` for PRs** — `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` means PR runs are never cancelled because `github.head_ref` is always set for PRs. On pushes to main, `github.run_id` is unique per run, so nothing is cancelled anyway. **Fix:** Use `${{ github.workflow }}-${{ github.event.number || github.ref }}` to properly cancel superseded PR and push runs. **Status: FIXED** — Changed to `${{ github.workflow }}-${{ github.head_ref || github.ref }}` which correctly cancels runs for the same branch.

12. **`|| true` masks `continue-on-error: true`** — `python scripts/forbidden_imports.py || true` with `continue-on-error: true` is double insurance for silence. The `|| true` is redundant and misleading. **Status: FIXED** — Removed `|| true`, kept `continue-on-error: true` for now (though NFR-A12 violation remains).

13. **No database setup for integration tests** — Backend tests use in-memory SQLite, but integration tests that need a persistent database (even temporary) have no service container or setup step. **Recommendation:** Add `sqlite3` as a service or use `tmpdir` fixture for file-based SQLite.

14. **Acceptance criterion 6 is unverifiable in CI** — "merge button shows CI checks as passing" depends on GitHub branch protection settings, not on the workflow file itself. This AC cannot be validated by the CI workflow alone. **Fix:** Change to "Given CI workflow passes, then GitHub API returns check suite conclusion as completed."

15. **No smoke test for Docker compose** — Epic 7 acceptance says "`docker-compose up` starts both services" but this story has no Docker validation. ST-7.2 covers Dockerfiles but not a smoke test. **Recommendation:** Add a `docker-smoke` job that runs `docker compose up -d && sleep 5 && curl -f http://localhost:8000/health && docker compose down`.

16. **No security scanning** — Pipeline has no dependency vulnerability check (e.g., `pip audit`, `npm audit`, `trivy`). Security issues in dependencies slip through silently. **Recommendation:** Add `pip-audit` and `npm audit` jobs or use GitHub Dependabot alerts.

17. **Design notes mention "Python syntax check" but job doesn't run one** — Design notes say backend-lint runs "Python syntax check and `python scripts/forbidden_imports.py`" but the actual job only runs the forbidden import script. **Fix:** Add `python -m py_compile backend/**/*.py` or similar syntax check.

18. **No explicit Python version pinning** — `python-version: '3.12'` installs any 3.12.x patch version. Different patch versions can have subtle differences. **Fix:** Use `python-version: '3.12.7'` (or latest stable) for reproducible builds.

19. **Backend test working directory is implicit** — `cd backend && pytest -v --tb=short` works but relies on the default working directory. If the repo structure changes, this silently runs pytest on the wrong directory. **Fix:** Use `working-directory: backend` at the job level for clarity.

20. **No git configuration for commits** — If tests or builds create git commits (e.g., for snapshot testing), the default CI environment has no git user configured, causing failures. **Recommendation:** Add `git config user.email` and `git config user.name` steps.

## Design Notes

The CI pipeline uses a **matrix-free** approach with separate jobs for each check to maximize parallelism and clarity. Each job is self-contained with its own dependency installation to avoid cross-contamination.

**Job structure (after adversarial review fixes):**
- `backend-lint`: Python 3.12, venv, syntax check (compileall), forbidden import check (NFR-A12 enforced)
- `backend-test`: Python 3.12, venv, pip cache, pytest with --cov=app --cov-fail-under=60
- `frontend-lint`: Node 20, npm cache, tsc -b --noEmit type checking
- `frontend-test`: Node 20, npm cache, vitest run --coverage
- `frontend-build`: Node 20, npm cache, vite build, artifact upload
- `security-audit`: pip-audit + npm audit (warn-only)

**Key decisions:**
- Caching enabled for pip and npm to hit 10-minute target
- Virtual environments isolate Python dependencies
- Artifact retention for coverage reports and build output (7-day retention)
- Docker build not in CI — covered by ST-7.2
- `npm ci` instead of `npm install` for deterministic, lockfile-based installs
- Git config set for potential snapshot test needs
- `fetch-depth: 0` and `submodule: recursive` for full checkout

**Fixes from adversarial review:**
- `forbidden_imports.py` false positive fixed: `app.orchestrator` is now valid (supervisor, team_factory)
- `continue-on-error: true` removed from forbidden import check — NFR-A12 now enforced
- Coverage thresholds added (60% baseline, can be raised as test suite matures)
- Frontend lint job added with tsc type checking
- Security audit job added (warn-only for initial CI)

## Verification

**Commands:**
- `cat .github/workflows/ci.yml` -- expected: workflow file exists with all jobs defined
- Manual: Push to a test branch and verify GitHub Actions workflow triggers and all jobs pass
- Manual: Add a forbidden import and verify the backend-lint job fails
- Manual: Push a PR and verify CI checks appear as required status checks
