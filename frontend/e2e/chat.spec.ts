import { test, expect } from './fixtures';
import { CommandCenterPage } from './pages/CommandCenter';

/**
 * Chat flow E2E tests (Story 7.5).
 *
 * Backend must be running with a mock LLM (NFR-A10) and in-memory
 * SQLite (NFR-A13). The mock LLM produces a deterministic response so
 * these tests never depend on a live model call.
 */
test.describe('Chat Flow', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  test('sends message and receives response', async ({ page }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    await commandCenter.sendMessage('Hello, can you help me capture an idea?');

    // The user's message renders in the message list.
    await expect(commandCenter.messageList).toContainText(
      'Hello, can you help me capture an idea?'
    );

    // A response eventually streams back and generation completes
    // (stop button disappears once streaming finishes).
    await expect(commandCenter.stopButton).toBeHidden({ timeout: 15_000 });
    await expect(commandCenter.messageList).toContainText(
      'This is a deterministic mock response',
      { timeout: 15_000 }
    );
  });

  test('stops generation during streaming', async ({ page }) => {
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    await commandCenter.sendMessage('Write a very long analysis of this idea.');

    // Wait for stop button to become visible before clicking
    await expect(commandCenter.stopButton).toBeVisible({ timeout: 10000 });
    await commandCenter.stopButton.click();

    // Streaming halts — stop button disappears and the partial
    // response (whatever was captured) remains in the message list.
    await expect(commandCenter.stopButton).toBeHidden();
    await expect(commandCenter.messageList).toBeVisible();
  });
});
