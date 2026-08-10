import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/app.js';
import type { DashboardState } from '../../src/tui/render-dashboard.js';
import { StreamThrottler } from '../../src/utils/stream-throttler.js';
import { stripAnsi } from '../../src/utils/ansi-cleaner.js';

describe('Milestone 4 - TUI Interactive Modals & Stream Throttling', () => {
  const baseState: DashboardState = {
    projectName: 'M4 Test Project',
    totalStories: 2,
    completedStories: 0,
    inProgressStories: 1,
    currentStoryKey: '4-1-interactive-modals',
    currentPhase: 'develop',
    activeSkill: 'bmad-dev-story',
    stories: [
      { key: '4-1-interactive-modals', epic: 'EP-4', status: 'in-progress', phase: 'dev', retries: 0 },
      { key: '4-2-stream-throttling', epic: 'EP-4', status: 'backlog', phase: '-', retries: 0 }
    ],
    agentOutput: 'Running M4 verification...',
    elapsedTime: 1000,
    driverName: 'gemini'
  };

  it('automatically triggers QueryModal when activeQuery is passed to App state', () => {
    const mockQuery = {
      rawPrompt: 'Confirm file overwrite [y/N]?',
      isConfirmation: true,
      defaultResponse: 'y'
    };

    const stateWithQuery: DashboardState = {
      ...baseState,
      activeQuery: mockQuery,
      onQueryAnswer: vi.fn()
    };

    const { lastFrame } = render(React.createElement(App, { initialState: stateWithQuery }));
    const frame = lastFrame();

    expect(frame).toContain('SUB-AGENT INTERACTIVE PROMPT');
    expect(frame).toContain('Confirm file overwrite [y/N]?');
    expect(frame).toContain('[y] — Confirm / Yes');
  });

  it('automatically triggers EscalationModal when escalationContext is passed to App state', () => {
    const mockEscalation = {
      storyKey: '4-1-interactive-modals',
      reason: 'Gate decision: ESCALATE_TO_HUMAN max retries exceeded',
      retryCount: 3,
      maxRetries: 3,
      testOutput: 'FAIL src/tui/app.test.ts (1 test failed)'
    };

    const stateWithEscalation: DashboardState = {
      ...baseState,
      escalationContext: mockEscalation,
      onEscalationDecision: vi.fn()
    };

    const { lastFrame } = render(React.createElement(App, { initialState: stateWithEscalation }));
    const frame = lastFrame();

    expect(frame).toContain('ESCALATION REQUIRED: 4-1-interactive-modals');
    expect(frame).toContain('Gate decision: ESCALATE_TO_HUMAN max retries exceeded');
    expect(frame).toContain('1. Retry (same prompt)');
    expect(frame).toContain('4. Skip this story');
  });

  it('batches rapid stream output via 50ms StreamThrottler', async () => {
    const flushedBatches: string[][] = [];
    const throttler = new StreamThrottler<string>((items) => {
      flushedBatches.push(items);
    }, 50);

    throttler.push('chunk 1');
    throttler.push('chunk 2');
    throttler.push('chunk 3');

    expect(flushedBatches.length).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0]).toEqual(['chunk 1', 'chunk 2', 'chunk 3']);
  });

  it('safely strips ANSI control codes before string slicing', () => {
    const rawAnsiLog = '\u001b[32m[DRIVER INIT] Spawning sub-agent bmad-dev-story...\u001b[0m';
    const cleanLog = stripAnsi(rawAnsiLog);
    
    expect(cleanLog).not.toContain('\u001b');
    expect(cleanLog).toBe('[DRIVER INIT] Spawning sub-agent bmad-dev-story...');

    const sliced = cleanLog.length > 38 ? cleanLog.slice(0, 36) + '..' : cleanLog;
    expect(sliced).toBe('[DRIVER INIT] Spawning sub-agent b..');
    expect(sliced).not.toContain('\u001b');
  });
});
