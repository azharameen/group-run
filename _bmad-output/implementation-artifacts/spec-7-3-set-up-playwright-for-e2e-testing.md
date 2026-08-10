---
title: '7-3-set-up-playwright-for-e2e-testing'
type: 'chore'
created: '2026-08-10'
status: 'done'
baseline_revision: '931844cd093440407d61b87d01ed4f13ae46695f'
final_revision: 'pending-commit'
review_loop_iteration: 1
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-7-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** The project has no E2E testing infrastructure. Backend has pytest (30 files) and frontend has Vitest for unit/component tests, but there are no browser-level tests to verify critical user flows work end-to-end. Without E2E tests, regressions in chat, threads, ideas, and HITL flows can only be caught manually.

**Approach:** Install and configure Playwright for E2E testing in the frontend directory. Set up proper configuration for running against both dev servers and Docker Compose environments. Create base test infrastructure (fixtures, page objects, auth state) without writing actual test specs (those come in Story 7.5).

## Boundaries & Constraints

**Always:**
- Playwright tests are separate from Vitest tests — no glob collisions
- Tests run against the full application (frontend dev server + backend), not mocked services
- Use `baseURL: http://localhost:3000` for dev environment testing
- Tests must start/stop the application via Playwright's `webServer` config or docker-compose helpers
- Follow NFR-A10: tests must mock LLM boundary — use mock LLM patterns from existing backend conftest.py
- Follow NFR-A13: tests use in-memory SQLite, never hit the real database
- Use TypeScript strict mode for all test files
- Test files use `*.spec.ts` extension to distinguish from Vitest's `*.test.tsx`

**Block If:**
- Playwright browser binaries cannot be installed (CI/CD environment constraints)
- Frontend dev server cannot start without external dependencies
- Backend API requires credentials that cannot be mocked

**Never:**
- Modify existing backend tests or Vitest configuration
- Write actual E2E test cases (that's Story 7.5)
- Change application code to accommodate tests
- Add auth mocking — the app has no authentication
- Configure visual regression testing (out of scope)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh Playwright install | `npm install -D @playwright/test` | Package installed, browsers downloadable | Network failure blocks install |
| Playwright config generation | npx playwright init | playwright.config.ts created with defaults | Config file already exists |
| WebServer startup | config.webServer points to `npm run dev` | Vite server starts on port 3000 | Port 3000 already in use |
| Backend dependency | Playwright tests hit localhost:8000 | Backend must be running for API calls | 503 error if backend down |
| Docker Compose target | baseURL points to localhost:3000 (nginx) | Tests run against production-like bundle | Docker not running |

</intent-contract>

## Code Map

- `frontend/package.json` -- Add @playwright/test dev dependency and test scripts
- `frontend/playwright.config.ts` -- New Playwright configuration file
- `frontend/e2e/` -- New directory for E2E test specs (Story 7.5)
- `frontend/e2e/fixtures.ts` -- New global fixtures and test helpers
- `frontend/e2e/pages/` -- Page object patterns for reusable selectors
- `frontend/e2e/pages/CommandCenter.ts` -- Main chat interface page object
- `frontend/e2e/pages/Dashboard.ts` -- Ideas list page object
- `frontend/e2e/pages/KnowledgeBase.ts` -- Knowledge base management page object
- `backend/tests/conftest.py` -- Existing backend fixtures (reference for mock patterns)
- `docker-compose.yml` -- Service orchestration for E2E test environment
- `_bmad-output/implementation-artifacts/epic-7-context.md` -- Epic 7 context with NFRs

## Tasks & Acceptance

**Execution:**
- [x] `frontend/package.json` -- Add `@playwright/test` as devDependency — Enables Playwright test framework
- [x] `frontend/package.json` -- Add E2E test scripts: `test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `test:e2e:docker` — Provides CLI entry points for different run modes
- [x] `frontend/playwright.config.ts` -- Create Playwright config with baseURL, webServer, and project definitions — Core configuration for test execution
- [x] `frontend/playwright.config.ts` -- Configure webServer to start Vite dev server and backend — Ensures app is running before tests
- [x] `frontend/playwright.config.ts` -- Add docker-compose project variant with baseURL pointing to nginx port — Allows testing production-like Docker builds
- [x] `frontend/e2e/fixtures.ts` -- Create global fixtures (test workspace, API helpers, mock LLM setup) — Reusable test setup following backend conftest patterns
- [x] `frontend/e2e/pages/CommandCenter.ts` -- Create page object for main chat interface — Encapsulates selectors and actions for chat flow
- [x] `frontend/e2e/pages/Dashboard.ts` -- Create page object for ideas dashboard — Encapsulates selectors and actions for ideas CRUD
- [x] `frontend/e2e/pages/KnowledgeBase.ts` -- Create page object for knowledge base — Encapsulates selectors and actions for KB management
- [x] `frontend/.gitignore` -- Add Playwright trace/screenshot/video artifacts to gitignore — Prevents committing test artifacts
- [x] `frontend/playwright.config.ts` -- Configure tracing, screenshot, and video capture on failure only — Debugging capability without cluttering successful runs
- [x] `frontend/playwright.config.ts` -- Set timeout and retry policies aligned with CI expectations — Ensures tests work in CI environment (referencing ST-7.1 CI pipeline)

**Acceptance Criteria:**
- Given `@playwright/test` is installed, when running `npm run test:e2e`, then Playwright test runner starts without errors.
- Given the Playwright config is valid, when running `npx playwright test --list`, then it lists available test files (even if empty initially).
- Given the webServer config is set, when running `npm run test:e2e`, then Vite dev server starts automatically before tests.
- Given the docker-compose project is configured, when running `npm run test:e2e:docker`, then tests target the nginx-served frontend.
- Given page objects are created, when importing them in a test file, then they export properly typed classes with async methods.
- Given global fixtures are defined, when extending `test` from fixtures, then fixtures are available in test scope.

## Spec Change Log

- [2026-08-10] **Review Loop #1:** 4 patches applied from adversarial review — isDockerRun exact match (fixes fragile argv substring), getJson content-type validation, waitForHealthy timeout 30s→10s (avoids eating test timeout), waitForLoaded warning instead of silent swallow. KEEP: Page object architecture, two-project config pattern, fixture API helpers design.
- [2026-08-10] **Deferred:** .gitignore overly broad pattern removed; dashboard getByPlaceholder selectors acceptable for initial setup (ST-7.5 will add data-testid); docker project no startup validation (ST-7.5 test specs will surface this); reuseExistingServer stale risk (CI runs fresh containers, local is dev convenience).

## Review Triage Log

### 2026-08-10 — Review pass (Blind Hunter + Edge Case Hunter)
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 0, medium 2, low 2)
- defer: 4 (high 0, medium 1, low 3)
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` isDockerRun argv substring → exact `--project=docker` match — prevents false positive on test file names containing "docker"
  - `[medium]` `[patch]` getJson missing content-type check — now validates JSON before parsing, prevents crash on HTML error pages
  - `[low]` `[patch]` waitForHealthy default 30s → 10s — avoids consuming entire test timeout on health check alone
  - `[low]` `[patch]` waitForLoaded silent error swallow → warning with context — preserves debug info without failing fast


## Design Notes

**Playwright Configuration Strategy:**
- Two project variants: `dev` (fast, hot-reload friendly) and `docker` (production-like, slower)
- `dev` project uses webServer to start both Vite dev server and backend uvicorn
- `docker` project expects docker-compose to be running externally, just sets baseURL
- No auth storageState needed — app has no authentication layer

**Page Object Pattern:**
- Each major route gets a page object class with typed methods
- Page objects encapsulate selectors, not test logic
- Methods return Promises for async operations (SSE streaming, API calls)
- Follow existing TypeScript patterns: `@/` path alias may not work in e2e/ — use relative imports

**Mocking Strategy:**
- Backend tests use `mock_agent`, `mock_supervisor` fixtures — E2E tests hit real API but backend uses mock LLM
- Set environment to use mock LLM before starting backend (via env vars or test fixtures)
- Backend conftest.py has `isolate_test_env` that clears OpenAI creds — replicate in E2E setup

**Vitest vs Playwright Separation:**
- Vitest: `src/**/*.test.{ts,tsx}` + `src/__tests__/**` — unit/component tests
- Playwright: `e2e/**/*.spec.ts` — browser integration tests
- Different extensions prevent accidental collision
- Different scripts: `npm test` (Vitest) vs `npm run test:e2e` (Playwright)

## Verification

**Commands:**
- `cd frontend && npm install` -- expected: @playwright/test installed without errors
- `npx playwright install` -- expected: Chromium, Firefox, WebKit browsers installed
- `npx playwright test --list` -- expected: lists any test files found (may be 0 initially if only scaffolding exists)
- `npx playwright test --project=dev --headed` -- expected: browser opens, tests run against dev server
- `npx playwright config` -- expected: validates playwright.config.ts syntax
