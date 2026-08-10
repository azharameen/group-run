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
    await this.page.goto('/ideas');
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

  async createIdea(title: string, description: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.descriptionInput.fill(description);
  }
}
