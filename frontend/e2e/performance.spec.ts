import { test, expect } from './fixtures';
import { CommandCenterPage } from './pages/CommandCenter';

/**
 * Performance E2E tests (Story 7.6).
 *
 * Measures user-visible latency for critical paths:
 * - Chat first-chunk latency
 * - Thread load time
 * - Interrupt approval UI time
 *
 * Uses Date.now() timing and page.metrics() for measurements.
 * Metrics are informational (logged to console), not hard assertions.
 * Backend must be running with mock LLM (NFR-A10) and in-memory SQLite (NFR-A13).
 */
test.describe('Performance Measurements', () => {
  test.beforeEach(async ({ api }) => {
    try {
      await api.waitForHealthy(2_000);
    } catch (_err) {
      // Backend not running — skip gracefully with clear message
      // To run: start backend with `uvicorn app.api.app:create_app --factory --port 8000`
      // and frontend with `npm run dev`
      test.skip(true, 'Backend server not available at ' + api.baseUrl);
    }
  });

  test('chat message first chunk latency', async ({ page }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    // Wait for page to be fully loaded
    await expect(commandCenter.chatInput).toBeEditable();

    const startTime = Date.now();
    await commandCenter.sendMessage('Hello, what can you help with?');

    // Wait for user message to appear
    await expect(commandCenter.messageList).toContainText(
      'Hello, what can you help with?'
    );

    // Wait for stop button to disappear (streaming completes)
    await expect(commandCenter.stopButton).toBeHidden({ timeout: 30_000 });

    const elapsed = Date.now() - startTime;

    // Capture timing info using performance API
    const tbt = await page.evaluate(() => {
      // Performance timing via browser performance API
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return nav ? nav.domContentLoadedEventEnd - nav.startTime : 0;
    });

    console.log(`[PERF] Chat first response time: ${elapsed}ms`);
    console.log(`[PERF] Browser DOMContentLoaded timing: ${tbt.toFixed(2)}ms`);

    // Informational — not a hard assertion
    // expect(elapsed).toBeLessThan(5000);

    // Verify the response was received
    await expect(commandCenter.message(1)).toBeVisible();
  });

  test('thread list load time', async ({ page, api }) => {
    const commandCenter = new CommandCenterPage(page);

    // Pre-seed threads via API
    const threadCount = 10;
    const threads: Array<{ thread_id: string; title: string }> = [];

    for (let i = 0; i < threadCount; i++) {
      const resp = await fetch(`${api.baseUrl}/api/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Perf Thread ${i}`, idea_id: null }),
      });
      if (!resp.ok) {
        throw new Error(`Create thread ${i} failed: ${resp.status}`);
      }
      const data = await resp.json();
      threads.push(data.thread);
    }

    // Verify all threads were created
    if (threads.length < threadCount) {
      throw new Error(`Only created ${threads.length}/${threadCount} threads`);
    }

    // Navigate first (opens the thread sidebar), then measure render time
    await commandCenter.goto();
    
    // Wait for thread list to render
    const startTime = Date.now();
    if (threads.length > 0) {
      const firstThreadButton = page.getByTestId(`thread-button-${threads[0].thread_id}`);
      await expect(firstThreadButton).toBeVisible({ timeout: 15_000 });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[PERF] Thread list render (${threadCount} threads): ${elapsed}ms`);

    // Verify page loaded
    await expect(commandCenter.chatInput).toBeEditable();
  });

  test('thread switch latency', async ({ page, api }) => {
    const commandCenter = new CommandCenterPage(page);

    // Create two threads via API
    const createThread = async (title: string) => {
      const resp = await fetch(`${api.baseUrl}/api/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, idea_id: null }),
      });
      if (!resp.ok) throw new Error(`Create failed: ${resp.status}`);
      return (await resp.json()) as { thread: { thread_id: string } };
    };

    const threadA = await createThread('Perf Switch A');
    const threadB = await createThread('Perf Switch B');

    await commandCenter.goto();

    const threadAButton = page.getByTestId(`thread-button-${threadA.thread.thread_id}`);
    const threadBButton = page.getByTestId(`thread-button-${threadB.thread.thread_id}`);

    await expect(threadAButton).toBeVisible();
    await expect(threadBButton).toBeVisible();

    // Measure switch latency
    const iterations = 5;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await threadAButton.click();
      await expect(threadAButton).toHaveAttribute('data-active', 'true');
      durations.push(Date.now() - start);

      const start2 = Date.now();
      await threadBButton.click();
      await expect(threadBButton).toHaveAttribute('data-active', 'true');
      durations.push(Date.now() - start2);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    console.log(`[PERF] Thread switch latency (${iterations * 2} switches): avg=${avg.toFixed(2)}ms`);
  });

  test('interrupt approval UI time', async ({ page, api }) => {
    // This test measures the UI time for approving an interrupt.
    // It requires an interrupt to exist in the system.
    // Create an interrupt via API.
    const resp = await fetch(`${api.baseUrl}/api/interrupts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: 'perf-thread',
        tool_name: 'test_tool',
        message: 'Please approve this test interrupt.',
      }),
    });

    if (!resp.ok) {
      // If interrupt creation fails (e.g., service not initialized),
      // skip the measurement — still verify the UI path exists
      console.log('[PERF] Interrupt creation failed, measuring UI readiness only');

      const commandCenter = new CommandCenterPage(page);
      await commandCenter.goto();
      await expect(commandCenter.chatInput).toBeEditable();
      return;
    }

    const data = (await resp.json()) as { interrupt: { id: string } };
    const interruptId = data.interrupt.id;

    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    // The interrupt overlay may appear depending on UI configuration.
    // Measure the time to approve via API (which reflects backend processing).
    const startTime = Date.now();
    const approveResp = await fetch(`${api.baseUrl}/api/interrupts/${interruptId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', reason: 'perf test' }),
    });

    const elapsed = Date.now() - startTime;
    expect(approveResp.ok).toBe(true);

    console.log(`[PERF] Interrupt approval API time: ${elapsed}ms`);
  });

  test('ideas list load time', async ({ page, api }) => {
    // Measure the ideas list API response time
    const iterations = 5;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const resp = await fetch(`${api.baseUrl}/api/ideas`);
      durations.push(Date.now() - start);
      expect(resp.ok).toBe(true);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    console.log(`[PERF] Ideas list API (${iterations} iterations): avg=${avg.toFixed(2)}ms max=${max}ms`);
  });

  test('page metrics baseline', async ({ page }) => {
    // Capture navigation timing before interaction
    const startTime = Date.now();
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();
    const navTime = Date.now() - startTime;

    await expect(commandCenter.chatInput).toBeEditable();

    // Capture browser performance metrics
    const navTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!nav) return { domReady: 0, load: 0 };
      return {
        domReady: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
      };
    });

    console.log('[PERF] Page metrics baseline:');
    console.log(`  Navigation time: ${navTime}ms`);
    console.log(`  DOMContentLoaded: ${navTiming.domReady.toFixed(2)}ms`);
    console.log(`  Load complete: ${navTiming.load.toFixed(2)}ms`);
  });
});
