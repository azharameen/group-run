import { formatApiError } from './errors';
import { reportError } from '@/lib/error-reporting';

const API_BASE = '/api';

export const DEFAULT_TIMEOUT_MS = 30000;

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers: customHeaders, ...fetchOptions } = options || {};

  const headers: Record<string, string> = { ...(customHeaders as Record<string, string>) };
  if (!(fetchOptions.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (fetchOptions.signal) {
    if (fetchOptions.signal.aborted) {
      controller.abort(fetchOptions.signal.reason);
    } else {
      fetchOptions.signal.addEventListener(
        'abort',
        () => controller.abort(fetchOptions.signal?.reason),
        { once: true },
      );
    }
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(formatApiError(res.status, text));
    }

    if (res.status === 204) return undefined as T;
    return await res.json();
  } catch (error) {
    if (timedOut) {
      throw reportError(`API timeout: ${path}`, new Error(`API timeout after ${timeoutMs} ms`));
    }
    reportError(`API request failed: ${path}`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
