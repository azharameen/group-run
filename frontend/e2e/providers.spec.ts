import { expect, test } from './fixtures';

const configuration = {
  provider_id: 'provider-e2e',
  provider: 'openai',
  name: 'E2E OpenAI',
  endpoint: 'https://api.openai.com/v1',
  is_enabled: false,
  has_credentials: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

test.describe('Provider configuration lifecycle', () => {
  test('saves, tests, enables, defaults, selects, and deletes a provider without a live API', async ({
    page,
    api,
  }) => {
    let savedConfiguration: typeof configuration | null = null;
    let defaultModel: { provider_id: string; model_id: string } | null = null;

    await page.route('**/api/providers**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const path = url.pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

      if (method === 'GET' && path === '/api/providers') {
        return json({ providers: savedConfiguration ? [savedConfiguration] : [], count: savedConfiguration ? 1 : 0 });
      }
      if (method === 'GET' && path === '/api/providers/catalog') {
        const groups = savedConfiguration?.is_enabled
          ? [{
              ...savedConfiguration,
              available: true,
              message: 'available',
              models: [{ model_id: 'live-model', display_name: 'Live model' }],
            }]
          : [];
        return json({ groups });
      }
      if (method === 'GET' && path === '/api/providers/default') {
        return json(defaultModel);
      }
      if (method === 'POST' && path === '/api/providers') {
        savedConfiguration = { ...configuration };
        return json(savedConfiguration, 201);
      }
      if (method === 'POST' && path.endsWith('/test')) {
        return json({
          provider_id: configuration.provider_id,
          provider: 'openai',
          success: true,
          message: 'Connection successful',
        });
      }
      if (method === 'PATCH' && path.endsWith('/enabled')) {
        savedConfiguration = { ...configuration, is_enabled: true };
        return json(savedConfiguration);
      }
      if (method === 'PUT' && path === '/api/providers/default') {
        defaultModel = { provider_id: configuration.provider_id, model_id: 'live-model' };
        return json({ ...defaultModel, provider: 'openai', name: 'E2E OpenAI', updated_at: configuration.updated_at });
      }
      if (method === 'DELETE' && path === `/api/providers/${configuration.provider_id}`) {
        savedConfiguration = null;
        defaultModel = null;
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });

    await api.waitForHealthy();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('user-menu-button').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Provider' }).click();

    await page.getByLabel('Configuration name').fill(configuration.name);
    await page.getByLabel('Endpoint URL').fill(configuration.endpoint);
    await page.getByLabel('API key').fill('test-only-key');
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.getByRole('status')).toContainText('Provider configuration saved.');

    await page.getByRole('button', { name: 'Test' }).click();
    await expect(page.getByRole('status')).toContainText('Connection successful');
    await page.getByRole('switch', { name: 'Enable provider configuration' }).click();
    await expect(page.getByRole('status')).toContainText('Provider enabled.');

    const defaultSelector = page.getByRole('combobox', { name: 'Select this configuration\'s default model' });
    await defaultSelector.click();
    await page.getByRole('option', { name: 'Live model' }).click();
    await expect(page.getByRole('status')).toContainText('Default model saved.');

    await page.keyboard.press('Escape');
    const chatSelector = page.getByRole('combobox', { name: 'Chat model' });
    await chatSelector.click();
    await expect(page.getByText('E2E OpenAI · openai')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.getByTestId('user-menu-button').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Provider' }).click();
    const configurationSelector = page.getByRole('combobox', { name: 'Choose a configuration' });
    await configurationSelector.click();
    await page.getByRole('option', { name: configuration.name }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('status')).toContainText('Provider deleted.');
  });
});
