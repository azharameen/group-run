import { test, expect } from './fixtures';
import { CommandCenterPage } from './pages/CommandCenter';

/**
 * HITL interrupt E2E tests (Story 7.5).
 *
 * Per the spec's HITL Testing Strategy: interrupts are created directly
 * via `POST /api/interrupts/` rather than through a mock LLM conversation,
 * which keeps these tests focused on verifying the interrupt UI contract
 * (display, approve, reject) rather than re-testing the chat flow.
 *
 * Threads are likewise created via the API; the sidebar thread list is only
 * fetched on mount (the app has no live channel for externally created
 * threads), so each test reloads after creating the thread (same pattern
 * as threads.spec.ts) before clicking it in the sidebar.
 */
test.describe('HITL Interrupts', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  async function createInterruptViaApi(
    api: { baseUrl: string },
    threadId: string
  ): Promise<string> {
    const response = await fetch(`${api.baseUrl}/api/interrupts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: threadId,
        tool_name: 'write_file',
        message: 'Approve writing to workspace/idea.md?',
        tool_input: { path: 'workspace/idea.md', content: 'test content' },
      }),
    });
    if (!response.ok) {
      throw new Error(`Create interrupt failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    return body.interrupt.id as string;
  }

  async function createThread(api: { baseUrl: string }): Promise<string> {
    const response = await fetch(`${api.baseUrl}/api/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'HITL Thread', idea_id: null }),
    });
    const body = await response.json();
    return body.thread.thread_id as string;
  }

  test('displays interrupt overlay', async ({ page, api }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    // Establish SSE connection before creating the interrupt
    const threadId = await createThread(api);
    // Reload so the mount-time thread fetch picks up the API-created thread.
    await commandCenter.goto();
    await page.getByTestId(`thread-button-${threadId}`).click();
    await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();

    // Now create the interrupt — SSE will receive it in real-time
    await createInterruptViaApi(api, threadId);

    await expect(commandCenter.interruptOverlay).toBeVisible();
  });

  test('approves interrupt', async ({ page, api }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    // Establish SSE connection before creating the interrupt
    const threadId = await createThread(api);
    // Reload so the mount-time thread fetch picks up the API-created thread.
    await commandCenter.goto();
    await page.getByTestId(`thread-button-${threadId}`).click();
    await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();

    // Now create the interrupt — SSE will receive it in real-time
    const interruptId = await createInterruptViaApi(api, threadId);

    await expect(commandCenter.interruptOverlay).toBeVisible();
    await commandCenter.approveInterrupt();

    await expect(commandCenter.interruptOverlay).toBeHidden();

    const resolved = await api.getJson<{ interrupts: { id: string; status: string }[] }>(
      '/api/interrupts/pending'
    );
    expect(resolved.interrupts.some((i) => i.id === interruptId)).toBe(false);
  });

  test('rejects interrupt', async ({ page, api }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    // Establish SSE connection before creating the interrupt
    const threadId = await createThread(api);
    // Reload so the mount-time thread fetch picks up the API-created thread.
    await commandCenter.goto();
    await page.getByTestId(`thread-button-${threadId}`).click();
    await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();

    // Now create the interrupt — SSE will receive it in real-time
    const interruptId = await createInterruptViaApi(api, threadId);

    await expect(commandCenter.interruptOverlay).toBeVisible();
    await commandCenter.rejectInterrupt();

    await expect(commandCenter.interruptOverlay).toBeHidden();

    const resolved = await api.getJson<{ interrupts: { id: string; status: string }[] }>(
      '/api/interrupts/pending'
    );
    expect(resolved.interrupts.some((i) => i.id === interruptId)).toBe(false);
  });

  test('resume returns 409 for API-created interrupt (no checkpoint)', async ({ page, api }) => {
    // Interrupts created via API have no checkpointed agent state, so resume must
    // return 409 "no resumable state" — never a fabricated result (Story 8.4 AC-5).
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    const threadId = await createThread(api);
    await commandCenter.goto();
    await page.getByTestId(`thread-button-${threadId}`).click();
    await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();

    const interruptId = await createInterruptViaApi(api, threadId);
    await expect(commandCenter.interruptOverlay).toBeVisible();
    await commandCenter.approveInterrupt();
    await expect(commandCenter.interruptOverlay).toBeHidden();

    const resume = await fetch(`${api.baseUrl}/api/interrupts/${interruptId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resume.status).toBe(409);
    expect((await resume.json()).detail).toContain('no resumable state');
  });
});
