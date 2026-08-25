import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api/request';
import { activateProvider, fetchProviders, saveProvider } from '../api/providers';

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
      model: 'llama3', is_active: false, has_credentials: false, created_at: '', updated_at: '',
    });
    await saveProvider({ provider: 'ollama', model: 'llama3' });
    expect(vi.mocked(request).mock.calls[0][1]).toMatchObject({
      method: 'POST',
    });
  });

  it('activates a provider through the API client', async () => {
    vi.mocked(request).mockResolvedValue({});
    await activateProvider('p1');
    expect(vi.mocked(request)).toHaveBeenCalledWith('/providers/p1/activate', expect.objectContaining({
      method: 'POST',
    }));
  });
});
