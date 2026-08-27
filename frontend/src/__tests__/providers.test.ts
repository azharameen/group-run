import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api/request';
import {
  fetchProviderCatalog,
  fetchProviders,
  saveProvider,
  setProviderDefault,
  setProviderEnabled,
} from '../api/providers';

vi.mock('../api/request', () => ({ request: vi.fn() }));

describe('provider API client', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
  });

  it('lists safe provider metadata', async () => {
    vi.mocked(request).mockResolvedValue({ providers: [], count: 0 });
    await fetchProviders();
    expect(request).toHaveBeenCalledWith('/providers');
  });

  it('sends provider mutations without deployment credentials', async () => {
    vi.mocked(request).mockResolvedValue({
      provider_id: 'p1', provider: 'ollama', name: 'Local', endpoint: 'http://localhost:11434',
      is_enabled: false, has_credentials: false, created_at: '', updated_at: '',
    });
    await saveProvider({
      provider: 'ollama',
      name: 'Local',
      endpoint: 'http://localhost:11434',
      is_enabled: false,
    });
    expect(vi.mocked(request).mock.calls[0][1]).toMatchObject({
      method: 'POST',
    });
  });

  it('updates enabled state without a global activation endpoint', async () => {
    vi.mocked(request).mockResolvedValue({});
    await setProviderEnabled('p1', true);
    expect(vi.mocked(request)).toHaveBeenCalledWith(
      '/providers/p1/enabled',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('uses catalog and default endpoints for live models', async () => {
    vi.mocked(request).mockResolvedValue({ groups: [] });
    await fetchProviderCatalog();
    expect(vi.mocked(request)).toHaveBeenCalledWith('/providers/catalog');
    vi.mocked(request).mockResolvedValue({ provider_id: 'p1', model_id: 'live' });
    await setProviderDefault('p1', 'live');
    expect(vi.mocked(request)).toHaveBeenCalledWith(
      '/providers/default',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
