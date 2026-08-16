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
    // Use domcontentloaded: the window 'load' event can be held hostage by
    // slow subresources and long-lived connections (the app keeps
    // /api/sse open for the lifetime of the page). App readiness is
    // established explicitly below (sidebar trigger visible).
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.ensureSidebarOpen();
  }

  /**
   * The thread sidebar starts collapsed (`SidebarProvider defaultOpen={false}`)
   * and renders nothing in rail mode, so `thread-button-*` /
   * `sidebar-new-thread-button` are only reachable while it is expanded.
   *
   * Expansion uses the app's Ctrl/Cmd+B keyboard toggle: it is a
   * window-level handler and — unlike the header trigger button, whose
   * click is unreliable while the collapsed rail is stacking over the
   * header — it works deterministically. The trigger click remains as a
   * fallback.
   */
  async ensureSidebarOpen(): Promise<void> {
    const page = this.page;
    // The header trigger renders as soon as the app shell mounts.
    const trigger = page.locator('[data-sidebar="trigger"]');
    await trigger.waitFor({ state: 'visible', timeout: 20_000 });

    const sidebarNewThread = page.getByTestId('sidebar-new-thread-button');
    if (await sidebarNewThread.isVisible().catch(() => false)) {
      return;
    }

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+b`);
    const opened = await sidebarNewThread
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;

    // Fallback: the header trigger button.
    await trigger.click();
    await sidebarNewThread.waitFor({ state: 'visible', timeout: 10_000 });
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
