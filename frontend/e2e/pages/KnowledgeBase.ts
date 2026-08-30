import type { Page, Locator } from '@playwright/test';
import { gotoRetryingTransientErrors } from '../navigation';

/**
 * Page object for the knowledge base management page (route `/knowledge-base`).
 *
 * Encapsulates selectors and actions only — assertions belong in the
 * test specs themselves (Story 7.5).
 */
export class KnowledgeBasePage {
  readonly page: Page;
  readonly loader: Locator;
  readonly fileInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loader = page.getByTestId('loader');
    this.fileInput = page.getByTestId('file-input');
  }

  async goto(): Promise<void> {
    // domcontentloaded: the 'load' event can be delayed by slow subresources
    // and the app's long-lived /api/sse stream; waitForLoaded() covers the
    // page-specific readiness below.
    await gotoRetryingTransientErrors(this.page, '/knowledge-base');
  }

  async waitForLoaded(): Promise<void> {
    await this.loader.waitFor({ state: 'detached' }).catch((err) => {
      // Loader may not appear if page loads fast — not an error
      console.warn('Loader never appeared, continuing:', err);
    });
  }

  async uploadDocument(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
  }
}
