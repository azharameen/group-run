import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/app.js';
import type { DashboardState } from '../../src/tui/render-dashboard.js';

describe('TUI Interactive Modal Routing (QueryModal & EscalationModal)', () => {
  const baseState: DashboardState = {
    projectName: 'Modal Test Project',
    totalStories: 2,
    completedStories: 0,
    inProgressStories: 1,
    currentStoryKey: '1-1-modal-test',
    currentPhase: 'develop',
    activeSkill: 'bmad-dev-story',
    stories: [
      { key: '1-1-modal-test', epic: 'EP-1', status: 'in-progress', phase: 'dev', retries: 0 }
    ],
    agentOutput: 'Running agent session...',
    elapsedTime: 1000,
    driverName: 'gemini'
  };

  it('routes to QueryModal overlay when activeQuery is present', () => {
    const queryState: DashboardState = {
      ...baseState,
      activeQuery: {
        rawPrompt: 'Overwrite file src/config.ts? [y/N]',
        isConfirmation: true,
        defaultResponse: 'y'
      }
    };

    const { lastFrame } = render(React.createElement(App, { initialState: queryState }));
    const frame = lastFrame();

    expect(frame).toContain('SUB-AGENT INTERACTIVE PROMPT');
    expect(frame).toContain('Overwrite file src/config.ts? [y/N]');
    expect(frame).toContain('[y] — Confirm / Yes');
  });

  it('routes to EscalationModal overlay when escalationContext is present', () => {
    const escalationState: DashboardState = {
      ...baseState,
      escalationContext: {
        storyKey: '1-1-modal-test',
        reason: 'Gate decision: RETRY_WITH_FEEDBACK limit exceeded',
        retryCount: 3,
        maxRetries: 3,
        testOutput: '1 unit test failed in auth.test.ts'
      }
    };

    const { lastFrame } = render(React.createElement(App, { initialState: escalationState }));
    const frame = lastFrame();

    expect(frame).toContain('ESCALATION REQUIRED: 1-1-modal-test');
    expect(frame).toContain('Gate decision: RETRY_WITH_FEEDBACK limit exceeded');
    expect(frame).toContain('1. Retry (same prompt)');
    expect(frame).toContain('4. Skip this story');
    expect(frame).toContain('5. Abort entire sprint execution');
  });
});
