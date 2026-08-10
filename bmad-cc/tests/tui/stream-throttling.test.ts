import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamThrottler } from '../../src/utils/stream-throttler.js';
import { stripAnsi, cleanAndSplitLines } from '../../src/utils/ansi-cleaner.js';

describe('Stream Output Batching / Throttling & ANSI Cleaning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers high-frequency stream items over a 50ms window before flushing', () => {
    const flushedItems: string[][] = [];
    const throttler = new StreamThrottler<string>((items) => {
      flushedItems.push(items);
    }, 50);

    throttler.push('log-1');
    throttler.push('log-2');
    throttler.push('log-3');

    // Not flushed immediately
    expect(flushedItems.length).toBe(0);
    expect(throttler.pendingCount).toBe(3);

    // Fast-forward 50ms
    vi.advanceTimersByTime(50);

    expect(flushedItems.length).toBe(1);
    expect(flushedItems[0]).toEqual(['log-1', 'log-2', 'log-3']);
    expect(throttler.pendingCount).toBe(0);
  });

  it('supports manual flush to process pending items immediately', () => {
    const flushedItems: string[][] = [];
    const throttler = new StreamThrottler<string>((items) => {
      flushedItems.push(items);
    }, 50);

    throttler.push('urgent-log-1');
    throttler.push('urgent-log-2');

    throttler.flush();

    expect(flushedItems.length).toBe(1);
    expect(flushedItems[0]).toEqual(['urgent-log-1', 'urgent-log-2']);
    expect(throttler.pendingCount).toBe(0);
  });

  it('strips ANSI color codes and escape sequences cleanly prior to length check and slicing', () => {
    const rawAnsiLog = '\u001b[32m[SUCCESS]\u001b[0m Sub-agent task completed cleanly in 120ms.';
    const cleaned = stripAnsi(rawAnsiLog);

    expect(cleaned).toBe('[SUCCESS] Sub-agent task completed cleanly in 120ms.');
    expect(cleaned.length).toBeLessThan(rawAnsiLog.length);
    expect(cleaned.slice(0, 9)).toBe('[SUCCESS]');
  });

  it('cleanAndSplitLines strips ANSI and splits multiline stream output', () => {
    const multilineAnsi = '\u001b[31mError Line 1\u001b[0m\n\u001b[33mWarning Line 2\u001b[0m';
    const lines = cleanAndSplitLines(multilineAnsi);

    expect(lines).toEqual(['Error Line 1', 'Warning Line 2']);
  });
});
