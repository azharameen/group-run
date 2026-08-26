import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, DEFAULT_TIMEOUT_MS } from '../api/request';
import { fetchOrganizations } from '../api/organizations';
import { fetchIdeas } from '../api/ideas';
import { fetchKnowledgeBase } from '../api/knowledge';

const { getIdToken } = vi.hoisted(() => ({
  getIdToken: vi.fn().mockResolvedValue('firebase-id-token'),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: { getIdToken },
  },
}));

describe('request API helper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getIdToken.mockClear();
    getIdToken.mockResolvedValue('firebase-id-token');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves JSON on successful request', async () => {
    const mockData = { success: true };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      }),
    );

    const promise = request('/test');
    await expect(promise).resolves.toEqual(mockData);
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(fetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer firebase-id-token',
    );
  });

  it('throws HTTP error on non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      }),
    );

    await expect(request('/test')).rejects.toThrow('API 404: Not Found');
  });

  it('times out after default 30000 ms when request hangs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    const promise = request('/test');
    const assertion = expect(promise).rejects.toThrow('API timeout after 30000 ms');
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    await assertion;
  });

  it('times out after custom timeoutMs when provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    const promise = request('/test', { timeoutMs: 5000 });
    const assertion = expect(promise).rejects.toThrow('API timeout after 5000 ms');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('supports caller-provided AbortSignal aborting request before timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('User aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    const callerController = new AbortController();
    const promise = request('/test', { signal: callerController.signal, timeoutMs: 30000 });
    const assertion = expect(promise).rejects.toThrow('User aborted');

    await Promise.resolve();
    callerController.abort();

    await assertion;
  });

  it('omits Content-Type header when body is FormData', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ uploaded: true }),
      }),
    );

    const formData = new FormData();
    await request('/upload', { method: 'POST', body: formData });

    expect(fetch).toHaveBeenCalledWith(
      '/api/upload',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(options?.headers).has('Content-Type')).toBe(false);
  });

  it('force-refreshes the token once after a 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        }),
    );

    await expect(request('/test')).resolves.toEqual({ success: true });
    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
  });

  it('works with API modules like fetchOrganizations, fetchIdeas, fetchKnowledgeBase when custom timeout is passed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    const promiseOrg = fetchOrganizations({ timeoutMs: 1000 });
    const assertionOrg = expect(promiseOrg).rejects.toThrow('API timeout after 1000 ms');
    await vi.advanceTimersByTimeAsync(1000);
    await assertionOrg;

    const promiseIdea = fetchIdeas({ timeoutMs: 2000 });
    const assertionIdea = expect(promiseIdea).rejects.toThrow('API timeout after 2000 ms');
    await vi.advanceTimersByTimeAsync(2000);
    await assertionIdea;

    const promiseKb = fetchKnowledgeBase({ timeoutMs: 3000 });
    const assertionKb = expect(promiseKb).rejects.toThrow('API timeout after 3000 ms');
    await vi.advanceTimersByTimeAsync(3000);
    await assertionKb;
  });
});
