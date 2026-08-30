import type { Page, Locator } from '@playwright/test';
import { gotoRetryingTransientErrors } from '../navigation';

/**
 * Page object for the Organization dashboard page (route `/organization`).
 *
 * Encapsulates selectors and actions only — assertions belong in the
 * test specs themselves.
 */
export class OrganizationPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly createButton: Locator;
  readonly nameError: Locator;
  readonly emptyState: Locator;
  readonly orgName: Locator;
  readonly cosStatus: Locator;
  readonly deptNames: Locator;
  readonly teamNames: Locator;
  readonly teamCapacities: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByTestId('org-name-input');
    this.descriptionInput = page.getByTestId('org-description-input');
    this.createButton = page.getByTestId('org-create-button');
    this.nameError = page.getByTestId('org-name-error');
    this.emptyState = page.getByTestId('org-empty-state');
    this.orgName = page.getByTestId('org-name');
    this.cosStatus = page.getByTestId('org-cos-status');
    this.deptNames = page.getByTestId('org-dept-name');
    this.teamNames = page.getByTestId('org-team-name');
    this.teamCapacities = page.getByTestId('org-team-capacity');
  }

  async goto(): Promise<void> {
    await gotoRetryingTransientErrors(this.page, '/organization');
  }

  async createOrganization(name: string, description?: string): Promise<void> {
    await this.nameInput.fill(name);
    if (description !== undefined) {
      await this.descriptionInput.fill(description);
    }
    await this.createButton.click();
  }
}
