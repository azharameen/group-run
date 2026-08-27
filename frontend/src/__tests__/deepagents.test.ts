import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPendingInterrupts,
  approveInterrupt,
  rejectInterrupt,
} from '../api/threads';
import { DEFAULT_TIMEOUT_MS } from '../api/request';

describe('deepagents.ts API module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('fetchPendingInterrupts', () => {
    it('fetches pending interrupts successfully', async () => {
      const mockInterrupts = [
        {
          id: 'int-1',
          thread_id: 'thread-1',
          tool_name: 'test_tool',
          tool_input: {},
          message: 'Approval needed',
          status: 'pending',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
        },
      ];

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ interrupts: mockInterrupts }),
        }),
      );

      const promise = fetchPendingInterrupts();
      await expect(promise).resolves.toEqual(mockInterrupts);
      expect(fetch).toHaveBeenCalledWith(
        '/api/interrupts/pending',
        expect.any(Object),
      );
    });

    it('handles server error response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ detail: 'Internal server error' }),
        }),
      );

      const promise = fetchPendingInterrupts();
      await expect(promise).rejects.toThrow('Internal server error');
    });

    it('times out when response hangs past default timeout', async () => {
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

      const promise = fetchPendingInterrupts();
      vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS);

      await expect(promise).rejects.toThrow('API timeout after 30000 ms');
    });

    it('times out when custom timeoutMs is passed', async () => {
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

      const promise = fetchPendingInterrupts({ timeoutMs: 2000 });
      vi.advanceTimersByTime(2000);

      await expect(promise).rejects.toThrow('API timeout after 2000 ms');
    });
  });

  describe('approveInterrupt', () => {
    it('approves an interrupt successfully with PATCH request', async () => {
      const mockInterrupt = {
        id: 'int-1',
        thread_id: 'thread-1',
        tool_name: 'test_tool',
        tool_input: {},
        message: 'Approval needed',
        status: 'approved',
        decision: 'approved',
        reason: 'Looks good',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ interrupt: mockInterrupt }),
        }),
      );

      const promise = approveInterrupt('int-1', 'approved', 'Looks good');
      await expect(promise).resolves.toEqual(mockInterrupt);
      expect(fetch).toHaveBeenCalledWith(
        '/api/interrupts/int-1/approve',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ decision: 'approved', reason: 'Looks good', reasoning: 'Looks good' }),
        }),
      );
    });

    it('handles error response when approving interrupt', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ detail: 'Interrupt not found' }),
        }),
      );

      const promise = approveInterrupt('int-invalid', 'approved', 'Looks good');
      await expect(promise).rejects.toThrow('Interrupt not found');
    });

    it('times out when approveInterrupt hangs past timeout', async () => {
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

      const promise = approveInterrupt('int-1', 'approved', 'Looks good', undefined, { timeoutMs: 5000 });
      vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow('API timeout after 5000 ms');
    });
  });

  describe('rejectInterrupt', () => {
    it('rejects an interrupt successfully with PATCH request', async () => {
      const mockInterrupt = {
        id: 'int-2',
        thread_id: 'thread-1',
        tool_name: 'test_tool',
        tool_input: {},
        message: 'Approval needed',
        status: 'rejected',
        decision: 'rejected',
        reason: 'Unsafe action',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ interrupt: mockInterrupt }),
        }),
      );

      const promise = rejectInterrupt('int-2', 'Unsafe action');
      await expect(promise).resolves.toEqual(mockInterrupt);
      expect(fetch).toHaveBeenCalledWith(
        '/api/interrupts/int-2/reject',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ decision: 'rejected', reason: 'Unsafe action', reasoning: 'Unsafe action' }),
        }),
      );
    });

    it('handles error response when rejecting interrupt', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ detail: 'Already processed' }),
        }),
      );

      const promise = rejectInterrupt('int-2', 'Unsafe action');
      await expect(promise).rejects.toThrow('Already processed');
    });

    it('times out when rejectInterrupt hangs past timeout', async () => {
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

      const promise = rejectInterrupt('int-2', 'Unsafe action', undefined, { timeoutMs: 3000 });
      vi.advanceTimersByTime(3000);

      await expect(promise).rejects.toThrow('API timeout after 3000 ms');
    });
  });
});
