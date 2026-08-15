import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the idea detail view (route `/ideas/:ideaId`).
 *
 * Encapsulates selectors and actions only — assertions belong in the
 * test specs themselves (Story 7.5).
 */
export class IdeaDetailPage {
  readonly page: Page;
  readonly title: Locator;
  readonly description: Locator;
  readonly overviewTab: Locator;
  readonly filesystemTab: Locator;
  readonly commentsTab: Locator;
  readonly commentTextarea: Locator;
  readonly submitCommentButton: Locator;
  readonly deleteAction: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('idea-detail-title');
    this.description = page.getByTestId('idea-detail-description');
    this.overviewTab = page.getByTestId('tab-overview');
    this.filesystemTab = page.getByTestId('tab-filesystem');
    this.commentsTab = page.getByTestId('tab-comments');
    this.commentTextarea = page.getByTestId('comment-textarea');
    this.submitCommentButton = page.getByTestId('submit-comment-button');
    this.deleteAction = page.getByTestId('delete-idea-action');
    this.confirmDeleteButton = page.getByTestId('confirm-delete-button');
  }

  async goto(ideaId: string): Promise<void> {
    // domcontentloaded + explicit readiness wait (see DashboardPage.goto).
    await this.page.goto(`/ideas/${ideaId}`, { waitUntil: 'domcontentloaded' });
    await this.title.waitFor({ state: 'visible', timeout: 20_000 });
  }

  fileItem(fileName: string): Locator {
    return this.page.getByText(fileName);
  }

  async openFilesystemTab(): Promise<void> {
    await this.filesystemTab.click();
  }

  async openCommentsTab(): Promise<void> {
    await this.commentsTab.click();
  }

  async addComment(text: string): Promise<void> {
    await this.openCommentsTab();
    await this.commentTextarea.fill(text);
    await this.submitCommentButton.click();
  }

  async deleteIdea(): Promise<void> {
    await this.deleteAction.click();
    await this.confirmDeleteButton.click();
  }
}
