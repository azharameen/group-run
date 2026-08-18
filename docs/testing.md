# End-to-End (E2E) Testing Strategy Contract

> **Last updated: 2026-08-18**
> **Source**: Architecture Decision AD-21 (Architecture Spine & Owner Decision 2026-08-18)

This document defines the E2E testing strategy, state isolation architecture, authoring guidelines, quarantine policy, CI gating policy, and coverage model for the platform.

---

## 1. Isolation Mechanism & Architecture

### Stack & Mechanism
To achieve fast, deterministic, and repeatable test runs, the E2E test suite operates against a controlled backend and frontend environment:
- **Backend Persistence**: In-memory SQLite (`sqlite:///:memory:`) configured via test runtime environment variables.
- **LLM Boundary**: Mock LLM (`DEEPAGENTS_MODEL="openai:test-model"`, `OPENAI_API_KEY="sk-test"`, `OPENAI_MODEL_NAME="gpt-4"`). The mock LLM produces deterministic response streams (NFR-A10/A13) without making external LLM API calls.
- **Per-Test State Reset**: Backend exposes a `POST /api/testing/reset` endpoint that wipes in-memory SQLite tables and resets mock state back to a baseline state.
- **Auto-Reset Fixture**: `autoResetState` auto-fixture in `frontend/e2e/fixtures.ts` automatically calls `POST /api/testing/reset` before every test spec execution.
- **Single Worker Execution**: Playwright configuration specifies `workers: 1` in `frontend/playwright.config.ts` to ensure strict sequential execution and eliminate concurrency state pollution.

### Incident History & Context
- **PR #18 Incident**: Early E2E runs suffered from order-dependent failures and dirty test state due to shared, persistent SQLite database files across tests and lack of state reset between specs. In PR #18, assertions were temporarily weakened or bypassed to force CI passes.
- **Issue #9 Resolution**: Issue #9 established the state isolation mechanism by adding the in-memory SQLite backend, mock LLM, `POST /api/testing/reset` endpoint, and `autoResetState` Playwright fixture running sequentially (`workers: 1`).
- **AD-21 Architecture Decision (2026-08-18)**: Recorded decision to maintain this stack (in-memory SQLite + mock LLM, without requiring PostgreSQL for E2E testing). E2E tests gate the `develop` branch.

---

## 2. How to Write a New Spec

### File Structure & Naming
- All E2E test specs live in `frontend/e2e/*.spec.ts`.
- Spec names should reflect the feature area being tested (e.g., `chat.spec.ts`, `hitl.spec.ts`, `ideas.spec.ts`, `performance.spec.ts`, `threads.spec.ts`).

### Fixtures
Always import `test` and `expect` from `./fixtures` (not `@playwright/test` directly):

```typescript
import { test, expect } from './fixtures';
import { CommandCenterPage } from './pages/CommandCenter';

test.describe('Feature Area', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  test('primary user flow case', async ({ page, api }) => {
    // Test implementation
  });
});
```

Importing from `./fixtures` ensures `autoResetState` executes before each test and grants access to the `api` helper fixture.

### Page Objects (POM Pattern)
Page objects reside in `frontend/e2e/pages/` (e.g. `CommandCenterPage`, `DashboardPage`, `IdeaDetailPage`, `KnowledgeBasePage`).
- **Responsibility**: Page objects encapsulate UI locators, navigation (`goto`), and user interaction methods (`sendMessage`, `openIdea`, `confirmDeleteDialog`).
- **Rule**: Page objects must **never** contain test assertions (`expect`). Assertions belong strictly in spec files.

### API Helpers for Test Setup
Avoid driving long UI setup sequences just to create precondition data. Use the `api` fixture or direct REST API requests (`POST /api/threads`, `POST /api/ideas`, `POST /api/interrupts/`) to seed required state before testing UI behaviors:

```typescript
// Pre-seed thread via API helper before verifying UI switching
const thread = await api.postJson('/api/threads', { title: 'Test Thread', idea_id: null });
```

### Timeout Budgets

| Scope | Budget | Configuration Location |
| ----- | ------ | ---------------------- |
| Expect assertions | 5,000ms | `expect.timeout` in `playwright.config.ts` |
| Action timeout | 10,000ms | `use.actionTimeout` in `playwright.config.ts` |
| Global test timeout | 30,000ms (CI) / 60,000ms (Local) | `timeout` in `playwright.config.ts` |
| Server startup & Warm-up | 120,000ms | `global-setup.ts` / `webServer.timeout` |

---

## 3. Quarantine Policy for Flaky Tests

Flaky tests degrade confidence in the pipeline and must be addressed with a zero-tolerance policy:

1. **Quarantine Immediately**: If a test is flaky or failing due to environment issues, mark it with `test.skip` and include a comment explaining the reason and referencing a tracked issue:
   ```typescript
   test.skip(true, 'Flaky thread switch timing under high load - see issue #123');
   ```
2. **Never Delete**: Flaky tests must **never** be deleted. They represent valuable coverage that needs investigation or refactoring.
3. **Never Silently Retry into Green**: Test retries in CI (2 retries configured) are for absorbing runner network transients only. Silently retrying flaky assertions without tracking the underlying cause is strictly forbidden. Weakening assertions (e.g., removing wait assertions or changing strict checks to truthy checks) is prohibited.

---

## 4. CI Gating Policy

- **Gated Branch (`develop`)**: E2E tests gate all pull requests targeting `develop` and direct pushes to `develop`.
- **CI Job Timeout**: 20 minutes (`timeout-minutes: 20` in `.github/workflows/ci.yml`).
- **Retries**: 2 retries configured in CI environment (`process.env.CI ? 2 : 0`).
- **Main Branch Policy**: `main` branch is ungated for E2E tests per AD-16. This policy will be revisited at the `v1.0.0` milestone release.

---

## 5. Coverage Model

The E2E test coverage model balances speed and comprehensive flow verification:

- **Per-Story Primary-Flow Cases**: Every story delivering new user-facing functionality must include primary-flow user E2E test cases.
- **Feature-Area Golden Paths**: One dedicated spec file exists per stable feature area in `frontend/e2e/*.spec.ts`.
- **Epic Signoff Requirement**: Epic close signoff requires feature-area golden-path E2E coverage across all capabilities delivered within the epic.
