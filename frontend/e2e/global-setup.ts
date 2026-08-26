/**
 * Playwright global setup — warm the backend's cached agent singletons
 * and the Vite dev server's module transform cache.
 *
 * Two one-time cold-start costs would otherwise land inside the first
 * test's 30s budget:
 *
 * 1. The supervisor graph (and the DeepAgents runtime it builds) is a
 *    lazy singleton: the first chat request pays a one-time construction
 *    cost that can take tens of seconds on slow machines. This setup
 *    sends one throwaway message and waits for the SSE stream to
 *    complete, forcing the server-side construction before any test.
 *
 * 2. The Vite dev server transforms modules on demand, and every app
 *    route is React.lazy — so the first visit to each route pays for its
 *    whole module graph. This setup loads `/`, `/ideas` and a
 *    `/ideas/:id` detail page in a real browser, so every worker page
 *    load afterwards hits the warm in-memory transform cache.
 *
 * NFR-A10: the backend under test must already be configured with the
 * mock model (see the CI workflow's e2e job environment), so this
 * warm-up never makes a live LLM call.
 */

import { chromium } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.PLAYWRIGHT_DEV_BASE_URL || 'http://localhost:3000';
const HEALTH_TIMEOUT_MS = 30_000;
const WARMUP_TIMEOUT_MS = 120_000;
let authorization = '';

async function authenticateWithEmulator(): Promise<void> {
  const app = initializeApp(
    { apiKey: 'fake-api-key', projectId: 'demo-companion-auth' },
    'playwright-global-setup',
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({
      sub: 'playwright-warmup-user',
      email: 'warmup@example.com',
      email_verified: true,
      name: 'Warmup User',
    }),
  );
  const result = await signInWithCredential(auth, credential);
  authorization = `Bearer ${await result.user.getIdToken()}`;
}

async function waitForHealthy(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Backend at ${API_BASE_URL} did not become healthy within ${HEALTH_TIMEOUT_MS}ms: ${String(lastError)}`
  );
}

async function createThread(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ title: 'Warmup Thread', idea_id: null }),
  });
  if (!response.ok) {
    throw new Error(`Warm-up: create thread failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { thread: { thread_id: string } };
  return body.thread.thread_id;
}

async function drainSseStream(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Warm-up: stream request failed: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Read until the server closes the stream (it always emits a terminal
  // event — state_update/error followed by done — before closing).
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
    decoder.decode();
  }
}

async function createIdea(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ title: 'Warmup Idea', signal_text: 'warmup' }),
  });
  if (!response.ok) {
    throw new Error(`Warm-up: create idea failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { idea_id: string };
  return body.idea_id;
}

async function warmUpFrontend(): Promise<void> {
  // Every route is React.lazy, so each route's module graph is cold
  // transformed by Vite on first visit. Visit every route the specs load
  // (/, /ideas, /ideas/:id) so the first test of each spec hits the warm
  // transform cache instead of paying tens of seconds inside its timeout.
  const visited: Array<{ path: string; ready: string }> = [
    { path: '/', ready: '[data-sidebar="trigger"]' },
    { path: '/ideas', ready: '[data-testid="filter-input"]' },
  ];

  let ideaId: string | null = null;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.log(`[warm-up pageerror] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.log(`[warm-up console.error] ${message.text()}`);
      }
    });
    await page.goto(`${FRONTEND_URL}/sign-in`, {
      waitUntil: 'domcontentloaded',
      timeout: WARMUP_TIMEOUT_MS,
    });
    await page.evaluate(async () => {
      const modulePath = '/src/lib/firebase-emulator-testing.ts';
      const { signInWithGoogleEmulatorForTesting } = await import(/* @vite-ignore */ modulePath);
      await signInWithGoogleEmulatorForTesting({
        sub: 'playwright-warmup-user',
        email: 'warmup@example.com',
        name: 'Warmup User',
      });
    });
    // Reload after seeding the emulator session so AuthProvider registers its
    // token listener against the persisted Firebase user before routing.
    await page.goto(FRONTEND_URL, {
      waitUntil: 'domcontentloaded',
      timeout: WARMUP_TIMEOUT_MS,
    });
    for (const visit of visited) {
      await page.goto(`${FRONTEND_URL}${visit.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: WARMUP_TIMEOUT_MS,
      });
      // The 'load' event can be held hostage by the long-lived /api/sse
      // connection, so a page-specific readiness locator is the signal.
      await page.locator(visit.ready).waitFor({ state: 'visible', timeout: WARMUP_TIMEOUT_MS });
    }

    // /ideas/:id needs a real idea to render; create one, warm the
    // lazy-loaded IdeaDetail module, then clean it up.
    ideaId = await createIdea();
    await page.goto(`${FRONTEND_URL}/ideas/${ideaId}`, {
      waitUntil: 'domcontentloaded',
      timeout: WARMUP_TIMEOUT_MS,
    });
    await page
      .locator('[data-testid="idea-detail-title"]')
      .waitFor({ state: 'visible', timeout: WARMUP_TIMEOUT_MS });
  } finally {
    await browser.close();
    if (ideaId) {
      const del = await fetch(`${API_BASE_URL}/api/ideas/${ideaId}`, {
        method: 'DELETE',
        headers: { Authorization: authorization },
      });
      if (!del.ok) {
        console.warn(`[global-setup] Warm-up idea cleanup failed: ${del.status}`);
      }
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const startedAt = Date.now();
  await waitForHealthy();
  await authenticateWithEmulator();

  const warmupDeadline = Date.now() + WARMUP_TIMEOUT_MS;
  try {
    const threadId = await createThread();
    await Promise.race([
      drainSseStream(`${API_BASE_URL}/api/threads/${threadId}/stream`, {
        text: 'Warm-up: can you help me capture an idea?',
      }),
      new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`Warm-up: agent response did not complete within ${WARMUP_TIMEOUT_MS}ms`)),
          warmupDeadline - Date.now()
        )
      ),
    ]);
  } catch (error) {
    // Fail fast: every chat test would fail in a confusing way otherwise.
    throw new Error(`Agent warm-up failed: ${String(error)}`);
  }

  try {
    await warmUpFrontend();
  } catch (error) {
    // Fail fast: every test navigates to the frontend first.
    throw new Error(`Frontend warm-up failed: ${String(error)}`);
  }

  // Reset application state after warm-up so the test run starts from a completely clean slate
  const resetResp = await fetch(`${API_BASE_URL}/api/testing/reset`, {
    method: 'POST',
    headers: { Authorization: authorization },
  });
  if (!resetResp.ok) {
    console.warn(`[global-setup] Post-warmup reset failed: ${resetResp.status}`);
  }

  console.log(
    `[global-setup] Backend agent + frontend warm-up & state reset complete in ${Date.now() - startedAt}ms`
  );
}
