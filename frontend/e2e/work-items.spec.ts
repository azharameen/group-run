import { test, expect } from './fixtures';
import { CommandCenterPage } from './pages/CommandCenter';

interface OrganizationResponse {
  organization: {
    org_id: string;
    name: string;
  };
}

/**
 * Command Center Work Items Tab E2E Specs (Story 8.2).
 *
 * Verifies the read-only Work Items tab under fresh backend state.
 */
test.describe('Work Items Tab', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  test('renders seeded work items newest-first with status badge and routing metadata', async ({
    page,
    api,
  }) => {
    // 1. Seed organization via REST API
    const orgRes = await api.postJson<OrganizationResponse>('/api/organizations', {
      name: 'E2E Work Items Org',
      description: 'Organization for Work Items E2E spec',
    });
    const orgId = orgRes.organization.org_id;

    // 2. Seed work items:
    // Item 1 (older): explicit valid department hint ("technology") -> high confidence
    await api.postJson('/api/work-items', {
      title: 'First Item (Technology)',
      description: 'Refactor build pipeline',
      org_id: orgId,
      department: 'technology',
      source: 'api',
    });

    // Short pause to ensure distinct created_at timestamp order
    await page.waitForTimeout(100);

    // Item 2 (newer): no department hint -> default fallback ("ideation") -> low confidence
    await api.postJson('/api/work-items', {
      title: 'Second Item (Default)',
      description: 'New product idea',
      org_id: orgId,
      source: 'api',
    });

    // 3. Open Command Center page and navigate to Work Items tab
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    await commandCenter.workItemsTabTrigger.click();

    // 4. Verify Work Items tab container is visible
    const tabContainer = page.getByTestId('work-items-tab');
    await expect(tabContainer).toBeVisible({ timeout: 10_000 });

    // 5. Verify work item rows (newest first: Item 2 then Item 1)
    const rows = page.getByTestId('work-item-row');
    await expect(rows).toHaveCount(2);

    // Row 0 (Newest: Second Item)
    const row0 = rows.nth(0);
    await expect(row0).toContainText('Second Item (Default)');
    await expect(row0.getByTestId('work-item-status')).toHaveText('new');
    const routing0 = row0.getByTestId('work-item-routing');
    await expect(routing0).toContainText('Routed to: ideation');
    await expect(routing0).toContainText('confidence: low');
    await expect(routing0).toContainText('decided by chief_of_staff');

    // Row 1 (Older: First Item)
    const row1 = rows.nth(1);
    await expect(row1).toContainText('First Item (Technology)');
    await expect(row1.getByTestId('work-item-status')).toHaveText('new');
    const routing1 = row1.getByTestId('work-item-routing');
    await expect(routing1).toContainText('Routed to: technology');
    await expect(routing1).toContainText('confidence: high');
    await expect(routing1).toContainText('decided by chief_of_staff');
  });

  test('renders empty state when organization exists but has zero work items', async ({
    page,
    api,
  }) => {
    // Seed an organization without any work items
    await api.postJson('/api/organizations', {
      name: 'Empty Work Items Org',
      description: 'Org with no work items',
    });

    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    await commandCenter.workItemsTabTrigger.click();

    // Verify work-items-empty state is visible with zero work items text
    const emptyState = page.getByTestId('work-items-empty');
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
    await expect(emptyState).toContainText('No work items yet');
  });

  test('renders no-organization empty state when no organization exists', async ({
    page,
  }) => {
    // Given fresh state (autoResetState ensures zero orgs)
    const commandCenter = new CommandCenterPage(page);
    await commandCenter.goto();

    await commandCenter.workItemsTabTrigger.click();

    // Verify work-items-empty state is visible with no org text and app does not crash
    const emptyState = page.getByTestId('work-items-empty');
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
    await expect(emptyState).toContainText('No organization yet');
  });
});
