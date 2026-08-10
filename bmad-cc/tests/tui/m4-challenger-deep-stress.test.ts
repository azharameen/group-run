import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { StreamThrottler } from '../../src/utils/stream-throttler.js';
import { stripAnsi, cleanAndSplitLines } from '../../src/utils/ansi-cleaner.js';
import { AgentOutputStream } from '../../src/tui/agent-output-stream.js';
import { QueryModal } from '../../src/tui/modals/query-modal.js';
import { EscalationModal } from '../../src/tui/modals/escalation-modal.js';

describe('Empirical Challenge M4 — Deep Stress & Edge Case Harness', () => {

  /* ========================================================================
   * 1. STREAM OUTPUT THROTTLING STRESS TESTS
   * ======================================================================== */
  describe('1. Stream Output Throttling & Batching Stress', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('handles high-throughput burst of 10,000 items without memory leak or dropped callbacks', () => {
      const flushedBatches: string[][] = [];
      const throttler = new StreamThrottler<string>((items) => {
        flushedBatches.push(items);
      }, 50);

      // Burst 10,000 items
      for (let i = 0; i < 10000; i++) {
        throttler.push(`high-frequency-item-${i}`);
      }

      expect(flushedBatches.length).toBe(0);
      expect(throttler.pendingCount).toBe(10000);

      // Fast forward window
      vi.advanceTimersByTime(50);

      expect(flushedBatches.length).toBe(1);
      expect(flushedBatches[0].length).toBe(10000);
      expect(flushedBatches[0][0]).toBe('high-frequency-item-0');
      expect(flushedBatches[0][9999]).toBe('high-frequency-item-9999');
      expect(throttler.pendingCount).toBe(0);
    });

    it('handles multiple rapid push-flush cycles cleanly', () => {
      const flushedBatches: string[][] = [];
      const throttler = new StreamThrottler<string>((items) => {
        flushedBatches.push(items);
      }, 50);

      for (let cycle = 0; cycle < 5; cycle++) {
        throttler.push(`cycle-${cycle}-a`);
        throttler.push(`cycle-${cycle}-b`);
        throttler.flush();
      }

      expect(flushedBatches.length).toBe(5);
      expect(flushedBatches.map(b => b.join(','))).toEqual([
        'cycle-0-a,cycle-0-b',
        'cycle-1-a,cycle-1-b',
        'cycle-2-a,cycle-2-b',
        'cycle-3-a,cycle-3-b',
        'cycle-4-a,cycle-4-b'
      ]);
      expect(throttler.pendingCount).toBe(0);
    });

    it('cancels pending timers on clear() and avoids orphan flushes', () => {
      const flushedBatches: string[][] = [];
      const throttler = new StreamThrottler<string>((items) => {
        flushedBatches.push(items);
      }, 50);

      throttler.push('doomed-item-1');
      throttler.push('doomed-item-2');
      expect(throttler.pendingCount).toBe(2);

      throttler.clear();
      expect(throttler.pendingCount).toBe(0);

      // Advance time past interval
      vi.advanceTimersByTime(100);
      expect(flushedBatches.length).toBe(0);
    });

    it('AgentOutputStream strictly enforces maxLines on massive input streams', () => {
      const stream = new AgentOutputStream(15);
      for (let i = 0; i < 500; i++) {
        stream.append(`\u001b[32mLog line ${i}\u001b[0m`);
      }

      expect(stream.totalLines()).toBe(15);
      const rendered = stream.render();
      const lines = rendered.split('\n');
      expect(lines.length).toBe(15);
      expect(lines[0]).toBe('Log line 485');
      expect(lines[14]).toBe('Log line 499');
    });
  });

  /* ========================================================================
   * 2. ANSI SAFE LOG SLICING STRESS TESTS
   * ======================================================================== */
  describe('2. ANSI Safe Log Slicing & Parsing Stress', () => {
    it('strips complex 24-bit RGB, OSC hyperlinks, and multi-code ANSI sequences', () => {
      const complexAnsi = '\u001b[38;2;255;128;0m\u001b[1m[RGB BOLD]\u001b[0m \u001b]8;;https://bmad.dev\u001b\x07Click Here\u001b]8;;\u001b\x07 \u001b[42;30mStatus OK\u001b[0m';
      const cleaned = stripAnsi(complexAnsi);

      expect(cleaned).not.toContain('\u001b');
      expect(cleaned).not.toContain('\x07');
      expect(cleaned).toBe('[RGB BOLD] Click Here Status OK');
    });

    it('handles empty strings, undefined inputs, and whitespace-only strings gracefully', () => {
      expect(stripAnsi('')).toBe('');
      expect(stripAnsi(null as any)).toBe('');
      expect(stripAnsi(undefined as any)).toBe('');
      expect(cleanAndSplitLines('')).toEqual(['']);
    });

    it('cleanAndSplitLines normalizes mixed CRLF and LF with heavy ANSI styling', () => {
      const mixedString = '\u001b[31mLine 1\u001b[0m\r\n\u001b[32mLine 2\u001b[0m\n\u001b[33mLine 3\u001b[0m\r\n';
      const lines = cleanAndSplitLines(mixedString);

      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3', '']);
    });

    it('supports slicing stripped string safely without breaking Unicode or ASCII boundaries', () => {
      const input = '\u001b[1m\u001b[34m[SUPERVISOR_DECISION]\u001b[0m Proceed with story EP-4/STORY-1 🚀';
      const clean = stripAnsi(input);

      expect(clean).toBe('[SUPERVISOR_DECISION] Proceed with story EP-4/STORY-1 🚀');
      const head = clean.slice(0, 21);
      expect(head).toBe('[SUPERVISOR_DECISION]');
    });
  });

  /* ========================================================================
   * 3. QUERY MODAL INPUT HANDLING STRESS TESTS
   * ======================================================================== */
  describe('3. QueryModal Input Handling & Edge Cases', () => {
    it('handles quick responses: uppercase Y / N', async () => {
      const onAnswer = vi.fn();
      const { stdin } = render(React.createElement(QueryModal, {
        rawPrompt: 'Overwrite file?',
        onAnswer
      }));

      stdin.write('Y');
      await new Promise(r => setTimeout(r, 20));
      expect(onAnswer).toHaveBeenCalledWith('y');
    });

    it('handles quick response: N', async () => {
      const onAnswer = vi.fn();
      const { stdin } = render(React.createElement(QueryModal, {
        rawPrompt: 'Delete directory?',
        onAnswer
      }));

      stdin.write('n');
      await new Promise(r => setTimeout(r, 20));
      expect(onAnswer).toHaveBeenCalledWith('n');
    });

    it('handles Enter key directly in quick response mode (default y)', async () => {
      const onAnswer = vi.fn();
      const { stdin } = render(React.createElement(QueryModal, {
        rawPrompt: 'Accept default option?',
        onAnswer
      }));

      stdin.write('\r');
      await new Promise(r => setTimeout(r, 20));
      expect(onAnswer).toHaveBeenCalledWith('y');
    });

    it('handles custom answer mode transition ("c") and backspacing on empty string without crash', async () => {
      const onAnswer = vi.fn();
      const { stdin } = render(React.createElement(QueryModal, {
        rawPrompt: 'Enter target branch name:',
        onAnswer
      }));

      // Switch to custom mode
      stdin.write('c');
      await new Promise(r => setTimeout(r, 20));

      // Press Backspace when buffer is empty (should not crash)
      stdin.write('\x7f');
      await new Promise(r => setTimeout(r, 20));

      // Type "feature/m4"
      stdin.write('feature/m4');
      await new Promise(r => setTimeout(r, 20));

      // Press Enter to submit
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 20));

      expect(onAnswer).toHaveBeenCalledWith('feature/m4');
    });

    it('falls back to default "y" when Enter is pressed on empty custom typing input', async () => {
      const onAnswer = vi.fn();
      const { stdin } = render(React.createElement(QueryModal, {
        rawPrompt: 'Custom prompt:',
        onAnswer
      }));

      // Press 'c' to open text input, then immediately press Enter
      stdin.write('c');
      await new Promise(r => setTimeout(r, 20));
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 20));

      expect(onAnswer).toHaveBeenCalledWith('y');
    });
  });

  /* ========================================================================
   * 4. ESCALATION MODAL ACTION SELECTION STRESS TESTS
   * ======================================================================== */
  describe('4. EscalationModal Action Selection & Navigation Stress', () => {
    const defaultContext = {
      storyKey: 'STORY-M4-TEST',
      reason: 'Unit tests failed 3 consecutive times',
      retryCount: 3,
      maxRetries: 3,
      testOutput: 'Error line 1\nError line 2\nError line 3\nError line 4\nError line 5\nError line 6',
      reviewFindings: 'Critical bug found in component X\nDetail 2\nDetail 3\nDetail 4\nDetail 5'
    };

    it('navigates options via Up/Down arrow keys with full wrap-around boundary support', async () => {
      const onDecision = vi.fn();
      const { stdin } = render(React.createElement(EscalationModal, {
        context: defaultContext,
        onDecision
      }));

      // Default index 0 (retry). Press Up arrow -> should wrap to index 4 (abort).
      stdin.write('\u001b[A');
      await new Promise(r => setTimeout(r, 20));

      // Press Enter -> should submit 'abort'
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 20));

      expect(onDecision).toHaveBeenCalledWith({ action: 'abort' });
    });

    it('selects option 3 (override-pass) directly via number key 3', async () => {
      const onDecision = vi.fn();
      const { stdin } = render(React.createElement(EscalationModal, {
        context: defaultContext,
        onDecision
      }));

      stdin.write('3');
      await new Promise(r => setTimeout(r, 20));

      expect(onDecision).toHaveBeenCalledWith({ action: 'override-pass' });
    });

    it('selects option 4 (skip) directly via number key 4', async () => {
      const onDecision = vi.fn();
      const { stdin } = render(React.createElement(EscalationModal, {
        context: defaultContext,
        onDecision
      }));

      stdin.write('4');
      await new Promise(r => setTimeout(r, 20));

      expect(onDecision).toHaveBeenCalledWith({ action: 'skip' });
    });

    it('handles option 2 (retry-with-prompt) text input, backspace, and custom prompt submission', async () => {
      const onDecision = vi.fn();
      const { stdin } = render(React.createElement(EscalationModal, {
        context: defaultContext,
        onDecision
      }));

      // Press '2' to enter custom instructions mode
      stdin.write('2');
      await new Promise(r => setTimeout(r, 20));

      // Type "Focus on fixing type errors"
      stdin.write('Focus on fixing type errors');
      await new Promise(r => setTimeout(r, 20));

      // Press backspace to remove 's'
      stdin.write('\x7f');
      await new Promise(r => setTimeout(r, 20));

      // Submit with Enter
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 20));

      expect(onDecision).toHaveBeenCalledWith({
        action: 'retry-with-prompt',
        customPrompt: 'Focus on fixing type error'
      });
    });

    it('renders cleanly and truncates testOutput / reviewFindings to top 4 lines', () => {
      const { lastFrame } = render(React.createElement(EscalationModal, {
        context: defaultContext,
        onDecision: vi.fn()
      }));

      const frame = lastFrame();
      expect(frame).toContain('ESCALATION REQUIRED: STORY-M4-TEST');
      expect(frame).toContain('Error line 1');
      expect(frame).toContain('Error line 4');
      expect(frame).not.toContain('Error line 5');
      expect(frame).toContain('Critical bug found in component X');
      expect(frame).not.toContain('Detail 5');
    });

    it('ignores invalid non-option number keys and letters gracefully', async () => {
      const onDecision = vi.fn();
      const { stdin } = render(React.createElement(EscalationModal, {
        context: defaultContext,
        onDecision
      }));

      // Press invalid keys: '0', '6', '9', 'z'
      stdin.write('0');
      stdin.write('6');
      stdin.write('9');
      stdin.write('z');
      await new Promise(r => setTimeout(r, 30));

      expect(onDecision).not.toHaveBeenCalled();
    });
  });
});
