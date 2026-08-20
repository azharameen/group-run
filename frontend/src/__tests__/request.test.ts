import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, DEFAULT_TIMEOUT_MS } from '../api/request';
import { fetchOrganizations } from '../api/organizations';
import { fetchIdeas } from '../api/ideas';
import { fetchKnowledgeBase } from '../api/knowledge';

describe('request API helper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    expect(fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
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
    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS);

    await expect(promise).rejects.toThrow('API timeout after 30000 ms');
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
    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow('API timeout after 5000 ms');
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

    callerController.abort();

    await expect(promise).rejects.toThrow('User aborted');
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
        headers: {},
      }),
    );
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
    vi.advanceTimersByTime(1000);
    await expect(promiseOrg).rejects.toThrow('API timeout after 1000 ms');

    const promiseIdea = fetchIdeas({ timeoutMs: 2000 });
    vi.advanceTimersByTime(2000);
    await expect(promiseIdea).rejects.toThrow('API timeout after 2000 ms');

    const promiseKb = fetchKnowledgeBase({ timeoutMs: 3000 });
    vi.advanceTimersByTime(3000);
    await expect(promiseKb).rejects.toThrow('API timeout after 3000 ms');
  });
});
