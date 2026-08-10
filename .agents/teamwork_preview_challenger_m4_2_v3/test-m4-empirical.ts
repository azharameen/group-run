import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { stripAnsi, cleanAndSplitLines } from '../../bmad-cc/src/utils/ansi-cleaner.js';
import { StreamThrottler } from '../../bmad-cc/src/utils/stream-throttler.js';
import { AgentOutputStream } from '../../bmad-cc/src/tui/agent-output-stream.js';
import { App } from '../../bmad-cc/src/tui/app.js';
import type { DashboardState } from '../../bmad-cc/src/tui/render-dashboard.js';

describe('Empirical Verification Harness — Milestone 4', () => {

  const baseState: DashboardState = {
    projectName: 'Empirical M4 Test Project',
    totalStories: 2,
    completedStories: 0,
    inProgressStories: 1,
    currentStoryKey: 'STORY-1',
    currentPhase: 'develop',
    activeSkill: 'bmad-dev-story',
    stories: [
      { key: 'STORY-1', epic: 'EP-1', status: 'in-progress', phase: 'dev', retries: 0 }
    ],
    agentOutput: 'Ready...',
    elapsedTime: 0,
    driverName: 'gemini'
  };

  /* ========================================================================
   * 1. ANSI ESCAPE CODE CLEANING BUG
   * ======================================================================== */
  describe('1. ANSI Escape Code Cleaning', () => {
    it('EMPIRICAL BUG REPRODUCTION: fails to strip OSC 8 hyperlink sequences', () => {
      const osc8Hyperlink = '\u001b]8;;https://example.com\x07Click Here\u001b]8;;\x07';
      const result = stripAnsi(osc8Hyperlink);
      console.log('stripAnsi OSC 8 result:', JSON.stringify(result));

      // Check if escape characters leak
      const hasEscapes = result.includes('\u001b') || result.includes('\x07');
      expect(hasEscapes).toBe(false);
      expect(result).toBe('Click Here');
    });

    it('handles 50,000 high-frequency ANSI log lines cleanly without memory blowup', () => {
      const stream = new AgentOutputStream(50);
      const startTime = Date.now();
      for (let i = 0; i < 50000; i++) {
        stream.append(`\u001b[31m[LOG ${i}]\u001b[0m High speed log output line with ANSI styling \u001b[1m\u001b[32mOK\u001b[0m`);
      }
      const duration = Date.now() - startTime;
      expect(stream.totalLines()).toBe(50);
      expect(duration).toBeLessThan(2000); // Should process within 2 seconds
    });
  });

  /* ========================================================================
   * 2. MODAL OVERLAY KEY HANDLING BUG REPRODUCTION
   * ======================================================================== */
  describe('2. Modal Overlay Key Handling & Key Leakage', () => {
    it('EMPIRICAL BUG REPRODUCTION: global hotkey "?" leaks into EscalationModal and changes appMode to help', async () => {
      const mockEscalation = {
        storyKey: 'STORY-1',
        reason: 'Build error',
        retryCount: 1,
        maxRetries: 3,
        testOutput: 'Error details'
      };

      const stateWithEscalation: DashboardState = {
        ...baseState,
        escalationContext: mockEscalation,
        onEscalationDecision: vi.fn()
      };

      const { lastFrame, stdin } = render(React.createElement(App, { initialState: stateWithEscalation }));
      
      // Verify Escalation Modal is active
      expect(lastFrame()).toContain('ESCALATION REQUIRED: STORY-1');

      // User presses '?' while Escalation Modal is displayed
      stdin.write('?');
      await new Promise(r => setTimeout(r, 50));

      const frameAfterQuestionMark = lastFrame();
      console.log('Frame after ? key in Escalation Modal:\n', frameAfterQuestionMark);

      // Expect Escalation Modal to STILL be displayed and not overridden by Help overlay
      expect(frameAfterQuestionMark).toContain('ESCALATION REQUIRED: STORY-1');
      expect(frameAfterQuestionMark).not.toContain('BMad Command Center — Keyboard Reference');
    });

    it('EMPIRICAL BUG REPRODUCTION: global hotkey "g" leaks into EscalationModal and opens Git Diff modal', async () => {
      const mockEscalation = {
        storyKey: 'STORY-1',
        reason: 'Build error',
        retryCount: 1,
        maxRetries: 3,
        testOutput: 'Error details'
      };

      const stateWithEscalation: DashboardState = {
        ...baseState,
        escalationContext: mockEscalation,
        onEscalationDecision: vi.fn()
      };

      const { lastFrame, stdin } = render(React.createElement(App, { initialState: stateWithEscalation }));
      
      expect(lastFrame()).toContain('ESCALATION REQUIRED: STORY-1');

      // User presses 'g' while Escalation Modal is displayed
      stdin.write('g');
      await new Promise(r => setTimeout(r, 50));

      const frameAfterG = lastFrame();
      console.log('Frame after g key in Escalation Modal:\n', frameAfterG);

      // Expect Escalation Modal to STILL be displayed and not overridden by Git Diff modal
      expect(frameAfterG).toContain('ESCALATION REQUIRED: STORY-1');
      expect(frameAfterG).not.toContain('GIT DIFF');
    });

    it('EMPIRICAL BUG REPRODUCTION: global hotkey "f" leaks into QueryModal and opens Filter modal', async () => {
      const mockQuery = {
        rawPrompt: 'Proceed with migration?',
        isConfirmation: true
      };

      const stateWithQuery: DashboardState = {
        ...baseState,
        activeQuery: mockQuery,
        onQueryAnswer: vi.fn()
      };

      const { lastFrame, stdin } = render(React.createElement(App, { initialState: stateWithQuery }));
      
      expect(lastFrame()).toContain('SUB-AGENT INTERACTIVE PROMPT');

      // User presses 'f' while Query Modal is displayed
      stdin.write('f');
      await new Promise(r => setTimeout(r, 50));

      const frameAfterF = lastFrame();
      console.log('Frame after f key in Query Modal:\n', frameAfterF);

      // Expect Query Modal to STILL be displayed and not overridden by Filter Modal
      expect(frameAfterF).toContain('SUB-AGENT INTERACTIVE PROMPT');
      expect(frameAfterF).not.toContain('FILTER STORIES');
    });
  });

  /* ========================================================================
   * 3. STDIN PAUSE / RESUME STATE FLOW
   * ======================================================================== */
  describe('3. Stdin Pause / Resume State Flow', () => {
    it('triggers onPause when Escape is pressed while workstation is running', async () => {
      const onPause = vi.fn();
      const onRun = vi.fn();

      const { stdin } = render(React.createElement(App, {
        initialState: baseState,
        onRun,
        onPause
      }));

      // Type "run" in directive chat to set isRunning = true
      stdin.write('run\r');
      await new Promise(r => setTimeout(r, 50));

      expect(onRun).toHaveBeenCalled();

      // Now press Escape to pause execution
      stdin.write('\u001b');
      await new Promise(r => setTimeout(r, 50));

      expect(onPause).toHaveBeenCalled();
    });

    it('triggers onPause when "pause" directive is submitted in chat', async () => {
      const onPause = vi.fn();
      const onRun = vi.fn();

      const { stdin } = render(React.createElement(App, {
        initialState: baseState,
        onRun,
        onPause
      }));

      stdin.write('run\r');
      await new Promise(r => setTimeout(r, 50));
      expect(onRun).toHaveBeenCalled();

      stdin.write('pause\r');
      await new Promise(r => setTimeout(r, 50));
      expect(onPause).toHaveBeenCalled();
    });
  });
});
