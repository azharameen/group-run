/**
 * Formats API error messages into user-facing strings, stripping raw JSON.
 *
 * Extracts `detail`, `message`, or `error` from JSON responses (e.g. FastAPI's
 * `{"detail": "..."}`), and falls back to raw text for non-JSON responses.
 */
export function formatApiError(status: number, text: string): string {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        let extracted: string | undefined;

        if (typeof parsed.detail === 'string' && parsed.detail) {
          extracted = parsed.detail;
        } else if (Array.isArray(parsed.detail) && parsed.detail.length > 0) {
          const items = parsed.detail.map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (
              item &&
              typeof item === 'object' &&
              'msg' in item &&
              typeof (item as { msg: unknown }).msg === 'string'
            ) {
              return (item as { msg: string }).msg;
            }
            return JSON.stringify(item);
          });
          extracted = items.join('; ');
        } else if (parsed.detail && typeof parsed.detail === 'object') {
          extracted = JSON.stringify(parsed.detail);
        } else if (typeof parsed.message === 'string' && parsed.message) {
          extracted = parsed.message;
        } else if (typeof parsed.error === 'string' && parsed.error) {
          extracted = parsed.error;
        }

        if (extracted) {
          return `API ${status}: ${extracted}`;
        }
      }
    } catch {
      // Not JSON or parse error — fallback to raw text
    }
  }

  return trimmed ? `API ${status}: ${trimmed}` : `API ${status}`;
}
