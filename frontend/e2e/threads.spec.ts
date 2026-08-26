import { test, expect } from './fixtures';
import { CommandCenterPage } from './pages/CommandCenter';

/**
 * Thread management E2E tests (Story 7.5).
 */
test.describe('Thread Management', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  test('creates new thread', async ({ page }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    await commandCenter.startNewThread();

    // Creating a new thread clears the message list back to empty state
    // and the chat input remains ready for use.
    await expect(commandCenter.chatInput).toBeEditable();
  });

  test('switches between threads', async ({ page, api }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    // Create two threads via API so setup does not depend on the
    // exercised UI flow.
    const createThread = async (title: string) => {
      const resp = await fetch(`${api.baseUrl}/api/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...api.authHeaders() },
        body: JSON.stringify({ title, idea_id: null }),
      });
      if (!resp.ok) {
        throw new Error(`Create thread failed: ${resp.status} ${await resp.text()}`);
      }
      return resp.json();
    };
    const threadA = await createThread('Thread A');
    const threadB = await createThread('Thread B');

    await commandCenter.goto();

    const threadAButton = page.getByTestId(`thread-button-${threadA.thread.thread_id}`);
    const threadBButton = page.getByTestId(`thread-button-${threadB.thread.thread_id}`);

    // Wait for thread buttons to appear after page load
    await expect(threadAButton).toBeVisible();
    await expect(threadBButton).toBeVisible();

    await threadAButton.click();
    await expect(threadAButton).toHaveAttribute('data-active', 'true');

    await threadBButton.click();
    await expect(threadBButton).toHaveAttribute('data-active', 'true');
    // Verify previous thread becomes inactive
    await expect(threadAButton).not.toHaveAttribute('data-active', 'true');
  });

  test('loads thread message history', async ({ page, api }) => {
    // Create a thread and send a message via API so the thread has
    // prior history before the UI loads it.
    const createResp = await fetch(`${api.baseUrl}/api/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...api.authHeaders() },
      body: JSON.stringify({ title: 'History Thread', idea_id: null }),
    });
    if (!createResp.ok) {
      throw new Error(`Create thread failed: ${createResp.status} ${await createResp.text()}`);
    }
    const created = await createResp.json();
    const threadId = created.thread.thread_id;

    // Send a message via stream endpoint and wait for it to complete
    const streamResp = await fetch(`${api.baseUrl}/api/threads/${threadId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...api.authHeaders() },
      body: JSON.stringify({ text: 'Remember this idea for later.', idea_id: null }),
    });
    if (!streamResp.ok) {
      throw new Error(`Stream message failed: ${streamResp.status} ${await streamResp.text()}`);
    }
    // Consume the full SSE response to ensure the message is persisted
    await streamResp.arrayBuffer();

    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    const threadButton = page.getByTestId(`thread-button-${threadId}`);
    // Wait for thread button to appear after page load
    await expect(threadButton).toBeVisible();
    await threadButton.click();

    // Wait for at least one message to appear before checking content
    await expect(commandCenter.messageList).toContainText('Remember this idea for later.');
  });
});
