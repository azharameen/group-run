---
title: '7-7-update-project-documentation'
type: 'chore'
created: '2026-08-10'
status: 'done'
baseline_revision: '3d19299'
review_loop_iteration: 1
followup_review_recommended: false
final_revision: '5996703'
context: ['_bmad-output/implementation-artifacts/epic-7-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** The project has no usable documentation for new developers or operators. The root README contains only shell commands with no explanation. There's no backend or frontend README, no deployment guide, and no developer onboarding instructions. New contributors cloning the repo have no way to understand how to set up, run, test, or deploy the application without reading through code and scattered docs/ files.

**Approach:** Create comprehensive README files (root, backend, frontend) and a deployment guide that reflect the current state after Epics 0-7. Documents will cover: project overview, local development setup, running tests, Docker Compose deployment, and environment configuration. Existing docs/ content will be preserved and cross-referenced.

## Boundaries & Constraints

**Always:**
- Documents reflect the actual current codebase (verified by reading files before documenting)
- Root README serves as the entry point with quick-start for immediate value
- Backend and frontend READMEs are self-contained for developers working in those subdirectories
- Deployment guide covers Docker Compose specifically (not Kubernetes or cloud)
- Environment variables are documented with purpose and required/optional status
- Test commands match what actually works (verified against CI pipeline in `.github/workflows/ci.yml`)
- Cross-reference existing docs/ files rather than duplicating them
- Documents are written in clear, actionable English suitable for developer onboarding

**Block If:**
- Core application endpoints or structure have changed undocumented since Epic 7.6
- Docker Compose setup doesn't actually work (can't verify deployment instructions)

**Never:**
- Invent API endpoints or environment variables that don't exist
- Modify any code files (this is documentation only)
- Duplicate content from existing docs/ files (link instead)
- Document legacy/deprecated features from workflow.md (Siemens-specific FSM)
- Add new dependencies or tools for documentation generation

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Root README overview | User reads README.md | Clear project description, quick start, links to sub-docs | No broken links |
| Local dev setup | Developer follows setup instructions | Both services running and accessible | Troubleshooting section for common errors |
| Running tests | Developer runs test commands | All tests pass with mock LLM configured | Mock LLM setup documented |
| Docker deployment | Operator runs docker-compose up | Both services start and communicate | Volume mount paths documented |
| Environment config | Developer copies .env.example | All required variables present with examples | Required vs optional clearly marked |

</intent-contract>

## Code Map

- `README.md` -- Root README; currently contains only shell commands; needs full rewrite
- `backend/README.md` -- **New**; backend project structure, dependencies, test commands
- `frontend/README.md` -- **New**; frontend project structure, dependencies, test commands
- `docs/DEPLOYMENT.md` -- **New**; Docker Compose deployment guide
- `docs/GETTING_STARTED.md` -- **New**; developer onboarding guide
- `.env.example` -- **New**; template for required environment variables
- `docker-compose.yml` -- Reference for deployment guide (read-only)
- `.github/workflows/ci.yml` -- Reference for CI pipeline documentation (read-only)
- `backend/app/api/app.py` -- Reference for API endpoints list (read-only)
- `backend/app/config.py` -- Reference for environment variables (read-only)
- `backend/pyproject.toml` or `backend/requirements.txt` -- Reference for backend dependencies (read-only)
- `frontend/package.json` -- Reference for frontend dependencies and scripts (read-only)
- `frontend/playwright.config.ts` -- Reference for E2E test configuration (read-only)
- `docs/architecture.md` -- Existing architecture doc to cross-reference
- `docs/features.md` -- Existing features doc to cross-reference
- `docs/coding-guidelines.md` -- Existing coding guidelines to cross-reference

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/config.py` -- Read to extract all environment variables with defaults for `.env.example` -- identify every Settings field
- [x] `.github/workflows/ci.yml` -- Read to extract exact CI steps for documentation -- ensure doc commands match CI reality
- [x] `docker-compose.yml` -- Read to extract service configuration, volumes, ports for deployment guide -- document what volumes mount where
- [x] `.env.example` -- **Create** with all required and optional environment variables, comments explaining each, example values for local dev -- gives developers a starting point
- [x] `README.md` -- **Rewrite** with project overview, architecture diagram link, quick-start commands, links to sub-readmes and docs/ -- replaces current shell-only content
- [x] `backend/README.md` -- **Create** with project structure, prerequisites, installation steps, running locally, running tests, running linting -- self-contained for backend developers
- [x] `frontend/README.md` -- **Create** with project structure, prerequisites, installation steps, running locally, running tests (Vitest + Playwright), building for production -- self-contained for frontend developers
- [x] `docs/DEPLOYMENT.md` -- **Create** with Docker Compose setup, required volumes, environment configuration, health checks, common issues -- enables operator deployment
- [x] `docs/GETTING_STARTED.md` -- **Create** with step-by-step onboarding: clone, setup venv, install deps, configure env, run both services, verify with test request -- 15-minute path to working app
- [x] `README.md` -- Verify all links work (backend/README.md, frontend/README.md, docs/ links) -- no broken references

**Acceptance Criteria:**
- Given a developer clones the repository, when they read the root README, then they can get both services running within 15 minutes following the quick-start section
- Given `.env.example` exists, when a developer copies it to `.env`, then all required variables are present with sensible defaults for local development
- Given a developer reads `backend/README.md`, when they follow the instructions, then they can run all backend tests without reading other documentation
- Given a developer reads `frontend/README.md`, when they follow the instructions, then they can run all frontend tests (Vitest and Playwright) without reading other documentation
- Given an operator reads `docs/DEPLOYMENT.md`, when they follow the Docker Compose instructions, then both services start and can communicate
- Given `docs/GETTING_STARTED.md` exists, when a new contributor follows the guide, then they have a complete development environment running
- Given the root README is rewritten, when a visitor opens it, then they see a project description, not shell commands
- All cross-references to existing docs/ files use correct relative paths

## Verification

**Manual checks:**
- Open README.md and verify it contains project description, quick-start, and links to sub-docs
- Verify backend/README.md exists and contains test commands that match `pytest backend/tests`
- Verify frontend/README.md exists and contains test commands for both Vitest and Playwright
- Verify docs/DEPLOYMENT.md exists and references actual docker-compose.yml configuration
- Verify .env.example contains all variables from Settings class in config.py
- Verify all relative links in README.md point to existing files
- Check that no legacy Siemens-specific content (workflow.md) is featured in new docs

</intent-contract>

## Design Notes

**Root README Structure:**
```markdown
# Companion

[1-2 sentence description]

## Quick Start
[Prerequisites + 5 commands to get running]

## Documentation
- [Getting Started](docs/GETTING_STARTED.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Architecture](docs/architecture.md)
...

## Project Structure
- `backend/` - FastAPI backend
- `frontend/` - Next.js frontend
- `docs/` - Documentation
```

**Environment Variables to Document** (from config.py Settings):
- `APP_ROOT_DIR` - Application root directory (required for Docker)
- `OPENAI_API_KEY` or equivalent LLM key
- `MCP_SERVERS` - JSON config for MCP servers
- `LANGGRAPH_STRICT_MSGPACK` - Must be `true` in production
- Database connection settings
- Any other Settings fields with defaults

**Key principle:** Every command in the documentation must be verified against the actual codebase. If CI runs `python -m pytest`, the README says `python -m pytest`, not `pytest`.

## Spec Change Log

## Review Triage Log

### 2026-08-10 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 3, low 5)
- defer: 5: (high 0, medium 3, low 2)
- reject: 9
- addressed_findings:
  - `[medium]` `[patch]` README.md repo directory hardcoded as "companion" — changed to `<repo-directory>` placeholder
  - `[medium]` `[patch]` frontend/README.md lists non-existent `tests/` directory — corrected to `src/__tests__/`
  - `[medium]` `[patch]` frontend/README.md omits VITE_API_PROXY requirement for local dev — added explicit setup instructions
  - `[low]` `[patch]` cp commands in README.md, backend/README.md, GETTING_STARTED.md lack Windows alternatives — added `Copy-Item` notes
  - `[low]` `[patch]` GETTING_STARTED.md venv activation mixes Windows/Linux — split into separate labeled blocks
  - `[low]` `[patch]` GETTING_STARTED.md curl health check unavailable on fresh Windows — added `Invoke-RestMethod` alternative
  - `[low]` `[patch]` DEPLOYMENT.md mkdir -p and chmod are Unix-only — added Windows alternatives and platform scoping
  - `[low]` `[patch]` DEPLOYMENT.md volume mount prerequisites unclear — added note about teams.yaml from repo

## Auto Run Result

**Summary:** Comprehensive project documentation created for developer onboarding and deployment. All documentation files created from scratch or rewritten to reflect the current state of the codebase after Epics 0-7.

**Files Changed:**
- `README.md` — Rewritten from shell commands to proper project overview with quick start
- `.env.example` — Expanded from 24 to 78 lines with detailed comments per variable
- `backend/README.md` — **New** — Backend setup, structure, test commands, key concepts
- `frontend/README.md` — **New** — Frontend setup, structure, test commands, key concepts
- `docs/GETTING_STARTED.md` — **New** — Step-by-step 15-minute onboarding guide
- `docs/DEPLOYMENT.md` — **New** — Docker Compose deployment with health checks and troubleshooting

**Review Findings:** 8 patches applied (Windows compatibility, accuracy fixes), 5 items deferred (pre-existing issues), 9 rejected (noise/out of scope).

**Verification:** All file paths and cross-references verified against actual codebase. Commands match CI pipeline configuration.