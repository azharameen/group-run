import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the ideas dashboard (route `/ideas`).
 *
 * Encapsulates selectors and actions only — assertions belong in the
 * test specs themselves (Story 7.5).
 */
export class DashboardPage {
  readonly page: Page;
  readonly filterInput: Locator;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.filterInput = page.getByPlaceholder('Filter ideas by keyword...');
    this.titleInput = page.getByPlaceholder('Enter idea title');
    this.descriptionInput = page.getByPlaceholder('Describe the problem or opportunity...');
  }

  async goto(): Promise<void> {
    // domcontentloaded + explicit readiness wait: the 'load' event can be
    // delayed by slow subresources and the app's long-lived /api/sse stream.
    await this.page.goto('/ideas', { waitUntil: 'domcontentloaded' });
    await this.filterInput.waitFor({ state: 'visible', timeout: 20_000 });
  }

  async filterBy(keyword: string): Promise<void> {
    await this.filterInput.fill(keyword);
  }

  ideaCard(ideaId: string): Locator {
    return this.page.getByTestId(`idea-card-${ideaId}`);
  }

  ideaTitle(ideaId: string): Locator {
    return this.page.getByTestId(`idea-title-${ideaId}`);
  }

  checkbox(ideaId: string): Locator {
    return this.page.getByTestId(`checkbox-${ideaId}`);
  }

  deleteButton(ideaId: string): Locator {
    return this.page.getByTestId(`delete-btn-${ideaId}`);
  }

  async openIdea(ideaId: string): Promise<void> {
    await this.ideaCard(ideaId).click();
  }

  /**
   * Confirms the idea-delete AlertDialog.
   *
   * On some machines Playwright's physical click does not reach Radix
   * dialog buttons (same class of click interception seen with the
   * sidebar trigger, where only a DOM-dispatched click landed), so if
   * the dialog is still open after the physical click we fall back to a
   * dispatched click event, which reliably fires the React handler.
   */
  async confirmDeleteDialog(): Promise<void> {
    const confirm = this.page.getByTestId('confirm-delete-button');
    await confirm.click();
    const closed = await confirm
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!closed) {
      await confirm.dispatchEvent('click');
    }
  }

  async createIdea(title: string, description: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.descriptionInput.fill(description);
  }
}
