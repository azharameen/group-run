import { test, expect } from './fixtures';
import { DashboardPage } from './pages/Dashboard';
import { IdeaDetailPage } from './pages/IdeaDetail';

/**
 * Ideas CRUD E2E tests (Story 7.5).
 *
 * Idea creation is done via the API to isolate these tests to what
 * they verify (UI display, detail view, deletion) rather than the
 * create-form submission path (see spec Design Notes).
 */
test.describe('Ideas CRUD', () => {
  test.beforeEach(async ({ api }) => {
    await api.waitForHealthy();
  });

  async function createIdeaViaApi(
    api: { baseUrl: string; authHeaders: () => Record<string, string> },
    title: string
  ): Promise<string> {
    const response = await fetch(`${api.baseUrl}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...api.authHeaders() },
      body: JSON.stringify({ title, signal_text: 'E2E test signal' }),
    });
    if (!response.ok) {
      throw new Error(`Create idea failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    return body.idea_id as string;
  }

  test('creates idea via API and verifies in UI', async ({ page, api }) => {
    const ideaId = await createIdeaViaApi(api, 'E2E Created Idea');

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.ideaCard(ideaId)).toBeVisible();
    await expect(dashboard.ideaTitle(ideaId)).toHaveText('E2E Created Idea');
  });

  test('views idea detail', async ({ page, api }) => {
    const ideaId = await createIdeaViaApi(api, 'E2E Detail Idea');

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.openIdea(ideaId);

    const ideaDetail = new IdeaDetailPage(page);
    await expect(page).toHaveURL(new RegExp(`/ideas/${ideaId}$`));
    // The detail view fetches detail + files + pending interrupts in
    // parallel; give the first (cold) backend round-trip room beyond the
    // 5s default. The assertion itself is unchanged.
    await expect(ideaDetail.title).toHaveText('E2E Detail Idea', { timeout: 15_000 });
    await expect(ideaDetail.description).toContainText('E2E test signal');
  });

  test('deletes idea and verifies removal', async ({ page, api }) => {
    const ideaId = await createIdeaViaApi(api, 'E2E Delete Idea');

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.ideaCard(ideaId)).toBeVisible();

    await dashboard.deleteButton(ideaId).click();
    await dashboard.confirmDeleteDialog();

    // The UI refetches after the DELETE round-trip; under dev-proxy load that
    // can exceed the default 5s expect window, so allow 15s for the card to go.
    await expect(dashboard.ideaCard(ideaId)).toHaveCount(0, { timeout: 15_000 });

    // Cross-check with the API that the idea is actually gone. Poll with a
    // bounded window in case the DELETE response is slow to land.
    await expect
      .poll(
        async () => {
          const listResponse = await api.getJson<{ ideas: { idea_id: string }[] }>('/api/ideas');
          return listResponse.ideas.some((idea) => idea.idea_id === ideaId);
        },
        { timeout: 15_000 },
      )
      .toBe(false);
  });
});
