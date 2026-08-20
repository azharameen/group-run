import { describe, test, expect } from 'vitest';
import { formatApiError } from '@/api/errors';

describe('formatApiError', () => {
  test('extracts detail string from JSON error response', () => {
    const input = JSON.stringify({ detail: 'Organization name must be a non-empty string' });
    expect(formatApiError(400, input)).toBe('API 400: Organization name must be a non-empty string');
  });

  test('extracts array of detail objects with msg property (e.g. FastAPI validation error)', () => {
    const input = JSON.stringify({
      detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'value_error.missing' }],
    });
    expect(formatApiError(422, input)).toBe('API 422: field required');
  });

  test('extracts array of detail strings', () => {
    const input = JSON.stringify({ detail: ['First error', 'Second error'] });
    expect(formatApiError(400, input)).toBe('API 400: First error; Second error');
  });

  test('extracts message property if detail is absent', () => {
    const input = JSON.stringify({ message: 'Resource not found' });
    expect(formatApiError(404, input)).toBe('API 404: Resource not found');
  });

  test('extracts error property if detail and message are absent', () => {
    const input = JSON.stringify({ error: 'Unauthorized access' });
    expect(formatApiError(401, input)).toBe('API 401: Unauthorized access');
  });

  test('falls back to raw text for non-JSON response', () => {
    expect(formatApiError(500, 'Internal Server Error')).toBe('API 500: Internal Server Error');
  });

  test('falls back to status code only when response body is empty', () => {
    expect(formatApiError(500, '')).toBe('API 500');
    expect(formatApiError(500, '   ')).toBe('API 500');
  });

  test('formats object detail as JSON string if not array or string', () => {
    const input = JSON.stringify({ detail: { code: 'INVALID', foo: 'bar' } });
    expect(formatApiError(400, input)).toBe('API 400: {"code":"INVALID","foo":"bar"}');
  });
});
