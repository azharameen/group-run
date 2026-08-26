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
  /** POST a JSON resource to the backend API. */
  postJson: <T = unknown>(path: string, body: unknown) => Promise<T>;
  /** Wait until the backend `/api/health` endpoint responds successfully. */
  waitForHealthy: (timeoutMs?: number) => Promise<void>;
  /** Reset backend application state to a clean, deterministic baseline. */
  resetState: () => Promise<void>;
  /** Set the Firebase emulator ID token used by protected API helpers. */
  setIdToken: (token: string) => void;
}

type Fixtures = {
  /** Helpers for talking directly to the backend REST API from a test. */
  api: ApiHelpers;
  /** Auto-use fixture that resets application state before every test. */
  autoResetState: void;
  /** Auto-use fixture that signs the browser into the Firebase Auth emulator. */
  authenticatedSession: void;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    const baseUrl = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:8000';
    let idToken = '';

    const authHeaders = (): Record<string, string> =>
      idToken ? { Authorization: `Bearer ${idToken}` } : {};

    const getJson = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders() });
      if (!response.ok) {
        throw new Error(`GET ${path} failed with status ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`GET ${path} returned non-JSON content type: ${contentType}`);
      }
      return (await response.json()) as T;
    };

    const postJson = async <T,>(path: string, body: unknown): Promise<T> => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`POST ${path} failed with status ${response.status}: ${await response.text()}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`POST ${path} returned non-JSON content type: ${contentType}`);
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
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`POST /api/testing/reset failed with status ${response.status}`);
      }
    };

    await use({
      baseUrl,
      getJson,
      postJson,
      waitForHealthy,
      resetState,
      setIdToken: (token) => {
        idToken = token;
      },
    });
  },

  authenticatedSession: [
    async ({ page, api }, use) => {
      await api.waitForHealthy();
      await page.goto('/sign-in');
      const signedIn = page.waitForURL((url) => url.pathname !== '/sign-in');
      await page.evaluate(async () => {
        const modulePath = '/src/lib/firebase-emulator-testing.ts';
        const { signInWithGoogleEmulatorForTesting } = await import(/* @vite-ignore */ modulePath);
        await signInWithGoogleEmulatorForTesting({
          sub: 'playwright-user',
          email: 'playwright@example.com',
          name: 'Playwright User',
          picture: 'https://example.com/playwright.png',
        });
      });
      await signedIn;
      const idToken = await page.evaluate(async () => {
        const modulePath = '/src/lib/firebase.ts';
        const { auth } = await import(/* @vite-ignore */ modulePath);
        if (!auth.currentUser) throw new Error('Firebase emulator user was not restored');
        return auth.currentUser.getIdToken();
      });
      api.setIdToken(idToken);
      await use();
    },
    { auto: true },
  ],

  autoResetState: [
    async ({ api, authenticatedSession: _authenticatedSession }, use) => {
      await api.resetState();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
