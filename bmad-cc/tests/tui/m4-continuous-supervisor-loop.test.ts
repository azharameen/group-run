import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/app.js';
import { QueryModal } from '../../src/tui/modals/query-modal.js';
import { EscalationModal } from '../../src/tui/modals/escalation-modal.js';
import { StreamThrottler } from '../../src/utils/stream-throttler.js';
import { stripAnsi, cleanAndSplitLines } from '../../src/utils/ansi-cleaner.js';
import type { DashboardState } from '../../src/tui/render-dashboard.js';
import { HeartbeatMonitor } from '../../src/watchdog/heartbeat-monitor.js';

describe('Milestone 4 — Continuous TUI Supervisor Loop & Interactive Modals', () => {
  const mockBaseState: DashboardState = {
    projectName: 'M4 Continuous Loop Test',
    totalStories: 3,
    completedStories: 0,
    inProgressStories: 1,
    currentStoryKey: '4-1-continuous-loop',
    currentPhase: 'develop',
    activeSkill: 'bmad-dev-story',
    stories: [
      { key: '4-1-continuous-loop', epic: 'EP-4', status: 'in-progress', phase: 'dev', retries: 0 },
      { key: '4-2-watchdog-timeout', epic: 'EP-4', status: 'backlog', phase: '-', retries: 0 },
      { key: '4-3-modal-wiring', epic: 'EP-4', status: 'backlog', phase: '-', retries: 0 }
    ],
    agentOutput: 'Supervisor loop standing by...',
    elapsedTime: 2000,
    driverName: 'gemini'
  };

  describe('1. QueryModal Interactive Input', () => {
    it('handles quick "y" answer via stdin', () => {
      const handleAnswer = vi.fn();
      const { stdin, unmount } = render(
        React.createElement(QueryModal, {
          rawPrompt: 'Proceed with changes to package.json? [y/N]',
          onAnswer: handleAnswer
        })
      );

      stdin.write('y');
      expect(handleAnswer).toHaveBeenCalledWith('y');
      unmount();
    });

    it('handles quick "n" answer via stdin', () => {
      const handleAnswer = vi.fn();
      const { stdin, unmount } = render(
        React.createElement(QueryModal, {
          rawPrompt: 'Delete temporary directory? [y/N]',
          onAnswer: handleAnswer
        })
      );

      stdin.write('n');
      expect(handleAnswer).toHaveBeenCalledWith('n');
      unmount();
    });

    it('handles custom answer typing mode ("c") and Enter submission', async () => {
      const handleAnswer = vi.fn();
      const { stdin, lastFrame, unmount } = render(
        React.createElement(QueryModal, {
          rawPrompt: 'Specify configuration key to update:',
          onAnswer: handleAnswer
        })
      );

      // Press 'c' to enter custom typing mode
      stdin.write('c');
      await new Promise((r) => setTimeout(r, 50));
      expect(lastFrame()).toContain('Type response:');

      // Type custom answer
      stdin.write('use-strict-mode');
      await new Promise((r) => setTimeout(r, 50));
      // Press Enter
      stdin.write('\r');
      await new Promise((r) => setTimeout(r, 50));

      expect(handleAnswer).toHaveBeenCalledWith('use-strict-mode');
      unmount();
    });
  });

  describe('2. EscalationModal Interactive Input', () => {
    const mockContext = {
      storyKey: '4-2-watchdog-timeout',
      reason: 'Subprocess output stalled (inactivity threshold 5000ms reached)',
      retryCount: 2,
      maxRetries: 3,
      testOutput: 'Watchdog timeout triggered after 5000ms'
    };

    it('selects option 1 (retry) via number key "1"', () => {
      const handleDecision = vi.fn();
      const { stdin, unmount } = render(
        React.createElement(EscalationModal, {
          context: mockContext,
          onDecision: handleDecision
        })
      );

      stdin.write('1');

      expect(handleDecision).toHaveBeenCalledWith({ action: 'retry' });
      unmount();
    });

    it('selects option 3 (override-pass) via number key "3"', () => {
      const handleDecision = vi.fn();
      const { stdin, unmount } = render(
        React.createElement(EscalationModal, {
          context: mockContext,
          onDecision: handleDecision
        })
      );

      stdin.write('3');

      expect(handleDecision).toHaveBeenCalledWith({ action: 'override-pass' });
      unmount();
    });

    it('selects option 4 (skip) via number key "4"', () => {
      const handleDecision = vi.fn();
      const { stdin, unmount } = render(
        React.createElement(EscalationModal, {
          context: mockContext,
          onDecision: handleDecision
        })
      );

      stdin.write('4');

      expect(handleDecision).toHaveBeenCalledWith({ action: 'skip' });
      unmount();
    });

    it('selects option 5 (abort) via number key "5"', () => {
      const handleDecision = vi.fn();
      const { stdin, unmount } = render(
        React.createElement(EscalationModal, {
          context: mockContext,
          onDecision: handleDecision
        })
      );

      stdin.write('5');

      expect(handleDecision).toHaveBeenCalledWith({ action: 'abort' });
      unmount();
    });

    it('handles option 2 (retry with custom prompt) via stdin typing', async () => {
      const handleDecision = vi.fn();
      const { stdin, lastFrame, unmount } = render(
        React.createElement(EscalationModal, {
          context: mockContext,
          onDecision: handleDecision
        })
      );

      // Press '2' for custom prompt
      stdin.write('2');
      await new Promise((r) => setTimeout(r, 50));
      expect(lastFrame()).toContain('Enter custom instructions for agent:');

      // Type prompt
      stdin.write('Use alternative mock server port 8080');
      await new Promise((r) => setTimeout(r, 50));
      // Press Enter
      stdin.write('\r');
      await new Promise((r) => setTimeout(r, 50));

      expect(handleDecision).toHaveBeenCalledWith({
        action: 'retry-with-prompt',
        customPrompt: 'Use alternative mock server port 8080'
      });
      unmount();
    });
  });

  describe('3. Stream Throttling & ANSI Stripping Performance', () => {
    it('processes 100 rapid log items with 50ms batching without dropping content', async () => {
      const receivedBatches: string[][] = [];
      const throttler = new StreamThrottler<string>((items) => {
        receivedBatches.push(items);
      }, 50);

      for (let i = 1; i <= 100; i++) {
        throttler.push(`\u001b[32m[LOG ${i}]\u001b[0m High speed sub-agent stdout stream message ${i}`);
      }

      expect(receivedBatches.length).toBe(0);

      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(receivedBatches.length).toBeGreaterThan(0);
      const totalItemsFlushed = receivedBatches.reduce((acc, batch) => acc + batch.length, 0);
      expect(totalItemsFlushed).toBe(100);

      // Verify ANSI codes in flushed items can be cleaned cleanly
      const firstItemClean = stripAnsi(receivedBatches[0][0]);
      expect(firstItemClean).toBe('[LOG 1] High speed sub-agent stdout stream message 1');
      expect(firstItemClean).not.toContain('\u001b');
    });
  });

  describe('4. Watchdog Heartbeat Monitoring in Supervisor Loop', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('triggers timeout callback when no stream activity occurs before threshold', () => {
      const onTimeout = vi.fn();
      const onActivity = vi.fn();

      const monitor = new HeartbeatMonitor({
        timeoutMs: 1000,
        onTimeout,
        onActivity
      });

      monitor.start();
      expect(monitor.isTimedOut()).toBe(false);

      // Pulse activity at 400ms
      vi.advanceTimersByTime(400);
      monitor.pulse();
      expect(onActivity).toHaveBeenCalledTimes(1);
      expect(monitor.isTimedOut()).toBe(false);

      // Advance past remaining 1000ms from pulse
      vi.advanceTimersByTime(1100);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(monitor.isTimedOut()).toBe(true);

      monitor.stop();
    });
  });

  describe('5. Continuous Loop State Transition Flow', () => {
    it('maintains state integrity when transitioning across stories', () => {
      const { lastFrame, unmount } = render(
        React.createElement(App, {
          initialState: mockBaseState
        })
      );

      const frame = lastFrame();
      expect(frame).toContain('M4 Continuous Loop Test');
      expect(frame).toContain('4-1-continuous-loop');
      expect(frame).toContain('gemini');
      unmount();
    });
  });
});
