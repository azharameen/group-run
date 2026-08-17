import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing.
 *
 * Two project variants are provided:
 *  - `dev`: runs against the Vite dev server (auto-started via `webServer`).
 *           The backend (FastAPI/uvicorn) is assumed to already be running
 *           on http://localhost:8000, e.g. via `npm run dev` counterpart
 *           `uvicorn app.main:app --port 8000` or the docker-compose backend
 *           service. Configure the backend to use a mock LLM (NFR-A10) and
 *           an in-memory SQLite database (NFR-A13) before running.
 *  - `docker`: targets a docker-compose stack already running externally
 *           (nginx-served frontend build + backend). No webServer is
 *           started for this project — bring up `docker compose up` first.
 *
 * Test files live in `e2e/**\/*.spec.ts` to avoid collisions with Vitest's
 * `src/**\/*.test.tsx` files.
 */

const DEV_BASE_URL = process.env.PLAYWRIGHT_DEV_BASE_URL || 'http://localhost:3000';
const DOCKER_BASE_URL = process.env.PLAYWRIGHT_DOCKER_BASE_URL || 'http://localhost:3000';

// The `docker` project targets an externally managed docker-compose stack,
// so we must not spin up a competing Vite dev server for it.
const isDockerRun = process.argv.some(
  (arg: string) => arg === '--project=docker' || arg.endsWith(':docker'),
);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  // Warm the backend's lazy agent singletons (supervisor graph + DeepAgents
  // runtime) with one throwaway chat message before any test runs, so tests
  // measure real response latency instead of cold-start construction cost.
  globalSetup: './e2e/global-setup.ts',

  // Fail the build on CI if test.only was accidentally left in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Run E2E tests sequentially in single worker to ensure deterministic state isolation
  workers: 1,

  // Global test timeout. 60s locally (this machine can take >30s just to
  // launch the browser under load — the first test pays that cost); 30s in
  // CI where browser launch is fast.
  timeout: process.env.CI ? 30_000 : 60_000,
  expect: {
    timeout: 5_000,
  },

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: DEV_BASE_URL,
    // Capture diagnostic artifacts only on failure/retry to avoid clutter.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'dev',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DEV_BASE_URL,
      },
    },
    {
      name: 'docker',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DOCKER_BASE_URL,
      },
      // No webServer here — expects `docker compose up` to already be running.
    },
  ],

  // Automatically start the Vite dev server for the `dev` project.
  // The backend is assumed to be running separately on port 8000
  // (proxied via VITE_API_PROXY / vite.config.ts's `/api` proxy).
  // Skipped when running the `docker` project, which expects
  // `docker compose up` to already be serving the app externally.
  webServer: isDockerRun
    ? undefined
    : {
        command: 'npm run dev',
        url: DEV_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
