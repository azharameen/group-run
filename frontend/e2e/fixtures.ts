import { test as base, expect, type Page } from '@playwright/test';

/**
 * Global Playwright fixtures.
 *
 * These fixtures provide shared setup for E2E specs (added in Story 7.5).
 * Following NFR-A10 (mock LLM boundary) and NFR-A13 (in-memory SQLite),
 * the backend under test must already be configured to use a mock LLM
 * and an in-memory database — this is done via backend environment
 * variables / test configuration, mirroring `isolate_test_env` in
 * `backend/tests/conftest.py`. These fixtures do not talk to a real
 * LLM or persistent database.
 */

export interface ApiHelpers {
  /** Base URL of the backend API (defaults to http://localhost:8000). */
  baseUrl: string;
  /** GET a JSON resource from the backend API. */
  getJson: <T = unknown>(path: string) => Promise<T>;
  /** Wait until the backend `/api/health` endpoint responds successfully. */
  waitForHealthy: (timeoutMs?: number) => Promise<void>;
  /** Reset backend application state to a clean, deterministic baseline. */
  resetState: () => Promise<void>;
}

type Fixtures = {
  /** Helpers for talking directly to the backend REST API from a test. */
  api: ApiHelpers;
  /** Auto-use fixture that resets application state before every test. */
  autoResetState: void;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    const baseUrl = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:8000';

    const getJson = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) {
        throw new Error(`GET ${path} failed with status ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`GET ${path} returned non-JSON content type: ${contentType}`);
      }
      return (await response.json()) as T;
    };

    const waitForHealthy = async (timeoutMs = 10_000): Promise<void> => {
      const deadline = Date.now() + timeoutMs;
      let lastError: unknown;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${baseUrl}/api/health`);
          if (response.ok) {
            return;
          }
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(
        `Backend at ${baseUrl} did not become healthy within ${timeoutMs}ms: ${String(lastError)}`
      );
    };

    const resetState = async (): Promise<void> => {
      const response = await fetch(`${baseUrl}/api/testing/reset`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`POST /api/testing/reset failed with status ${response.status}`);
      }
    };

    await use({ baseUrl, getJson, waitForHealthy, resetState });
  },

  autoResetState: [
    async ({ api }, use) => {
      await api.waitForHealthy();
      await api.resetState();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
