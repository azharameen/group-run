import { test, expect } from './fixtures';
import { OrganizationPage } from './pages/OrganizationPage';

/**
 * Organization Dashboard E2E Specs (Story 8.1 follow-up).
 *
 * Verifies empty state validation, creation flow, and populated tree rendering
 * against fresh backend state using the autoResetState isolation fixture.
 */
test.describe('Organization Dashboard', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  async function createOrgViaApi(
    api: { baseUrl: string },
    name: string,
    description = ''
  ): Promise<string> {
    const response = await fetch(`${api.baseUrl}/api/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!response.ok) {
      throw new Error(`Create org failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    return body.organization.org_id as string;
  }

  test('submits empty name and verifies inline validation error', async ({ page }) => {
    const orgPage = new OrganizationPage(page);
    await orgPage.goto();

    await expect(orgPage.emptyState).toBeVisible();

    // Submit empty name
    await orgPage.createButton.click();

    // Verify inline validation error is shown and empty state remains
    await expect(orgPage.nameError).toBeVisible();
    await expect(orgPage.nameError).toHaveText('Organization name is required');
    await expect(orgPage.orgName).toHaveCount(0);
  });

  test('creates organization via UI and verifies tree render', async ({ page, api }) => {
    const orgPage = new OrganizationPage(page);
    await orgPage.goto();

    await expect(orgPage.emptyState).toBeVisible();

    await orgPage.createOrganization('E2E Test Corp', 'An organization created in E2E test');

    // Verify tree renders organization header and Chief of Staff
    await expect(orgPage.orgName).toHaveText('E2E Test Corp', { timeout: 15_000 });
    await expect(orgPage.cosStatus).toHaveText('active');

    // Verify departments
    await expect(orgPage.deptNames).toHaveText(['Ideation', 'Technology']);

    // Verify teams and capacity counts
    await expect(orgPage.teamNames).toHaveText([
      'Idea Team',
      'Product Team',
      'Development Team',
      'Testing Team',
      'DevOps Team',
    ]);
    await expect(orgPage.teamCapacities).toHaveText([
      'Capacity 0/3',
      'Capacity 0/3',
      'Capacity 0/3',
      'Capacity 0/3',
      'Capacity 0/3',
    ]);

    // Verify persistence in backend API
    const listResponse = await api.getJson<{ organizations: { name: string }[] }>(
      '/api/organizations'
    );
    expect(listResponse.organizations.some((o) => o.name === 'E2E Test Corp')).toBe(true);
  });

  test('loads existing organization and renders departments, teams, status badges, and capacity', async ({
    page,
    api,
  }) => {
    // Seed an organization via API
    await createOrgViaApi(api, 'Pre-existing Org', 'Seeded via API');

    const orgPage = new OrganizationPage(page);
    await orgPage.goto();

    // Verify populated org tree renders on load
    await expect(orgPage.orgName).toHaveText('Pre-existing Org', { timeout: 15_000 });
    await expect(orgPage.cosStatus).toHaveText('active');

    // Verify departments
    await expect(orgPage.deptNames).toHaveText(['Ideation', 'Technology']);

    // Verify teams and capacity
    await expect(orgPage.teamNames).toHaveText([
      'Idea Team',
      'Product Team',
      'Development Team',
      'Testing Team',
      'DevOps Team',
    ]);
    await expect(orgPage.teamCapacities).toHaveText([
      'Capacity 0/3',
      'Capacity 0/3',
      'Capacity 0/3',
      'Capacity 0/3',
      'Capacity 0/3',
    ]);
  });
});
