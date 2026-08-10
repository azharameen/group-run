import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the main chat interface ("CommandCenter", route `/`).
 *
 * Encapsulates selectors and actions only — assertions belong in the
 * test specs themselves (Story 7.5).
 */
export class CommandCenterPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly stopButton: Locator;
  readonly messageList: Locator;
  readonly newThreadButton: Locator;
  readonly interruptOverlay: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly workspacePane: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chatInput = page.getByTestId('chat-input');
    this.sendButton = page.getByTestId('send-button');
    this.stopButton = page.getByTestId('stop-button');
    this.messageList = page.getByTestId('message-list');
    this.newThreadButton = page.getByTestId('new-thread-button');
    this.interruptOverlay = page.getByTestId('interrupt-overlay');
    this.approveButton = page.getByTestId('approve-button');
    this.rejectButton = page.getByTestId('reject-button');
    this.workspacePane = page.getByTestId('workspace-pane');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async sendMessage(message: string): Promise<void> {
    await this.chatInput.fill(message);
    await this.sendButton.click();
  }

  async startNewThread(): Promise<void> {
    await this.newThreadButton.click();
  }

  async approveInterrupt(): Promise<void> {
    await this.approveButton.click();
  }

  async rejectInterrupt(): Promise<void> {
    await this.rejectButton.click();
  }

  message(index: number): Locator {
    return this.page.getByTestId(`message-${index}`);
  }
}
