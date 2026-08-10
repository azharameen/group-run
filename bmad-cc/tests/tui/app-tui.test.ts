import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/app.js';
import type { DashboardState } from '../../src/tui/render-dashboard.js';

describe('React Ink App TUI Component - 3 Column Workstation Layout', () => {
  const mockState: DashboardState = {
    projectName: 'Test Project',
    totalStories: 3,
    completedStories: 1,
    inProgressStories: 1,
    currentStoryKey: '4-5-create-hitl-approval-ui-component',
    currentPhase: 'review',
    activeSkill: 'bmad-code-review',
    epicFilter: undefined,
    stories: [
      { key: '4-1-create-interrupt-service', epic: 'EP-4', status: 'done', phase: 'done', retries: 0 },
      { key: '4-5-create-hitl-approval-ui-component', epic: 'EP-4', status: 'review', phase: 'review', retries: 0 },
      { key: '4-7-frontend-tests-approval-ui', epic: 'EP-4', status: 'backlog', phase: '-', retries: 0 }
    ],
    agentOutput: 'Supervisor executing story 4-5...',
    elapsedTime: 5000,
    driverName: 'gemini'
  };

  it('renders 3-column command center layout with all panels', () => {
    const { lastFrame } = render(React.createElement(App, { initialState: mockState }));
    const frame = lastFrame();

    // Top header bar
    expect(frame).toContain('BMad Command Center');
    expect(frame).toContain('Test Project');

    // Left panel: Epic tree
    expect(frame).toContain('Epics');
    expect(frame).toContain('EP-4');

    // Middle panel: Supervisor chat
    expect(frame).toContain('Supervisor Console');
    expect(frame).toContain('gemini');

    // Right panel: Sub-session monitor
    expect(frame).toContain('Sub-Session');

    // Bottom status bar — keybinding hints appear (labels may wrap in narrow test viewport)
    expect(frame).toContain('[Tab]');
    expect(frame).toContain('[r]');
    expect(frame).toContain('[Esc]');
  });

  it('renders QueryModal overlay when activeQuery is provided in initialState', () => {
    const queryState: DashboardState = {
      ...mockState,
      activeQuery: {
        rawPrompt: 'Confirm overwrite of file src/main.ts? [y/N]',
        isConfirmation: true,
        defaultResponse: 'y'
      }
    };
    const { lastFrame } = render(React.createElement(App, { initialState: queryState }));
    const frame = lastFrame();

    expect(frame).toContain('SUB-AGENT INTERACTIVE PROMPT');
    expect(frame).toContain('Confirm overwrite of file src/main.ts? [y/N]');
    expect(frame).toContain('[y] — Confirm / Yes');
  });

  it('renders EscalationModal overlay when escalationContext is provided in initialState', () => {
    const escalationState: DashboardState = {
      ...mockState,
      escalationContext: {
        storyKey: '4-5-create-hitl-approval-ui-component',
        reason: 'Gate decision: ESCALATE_TO_HUMAN after 3 retries',
        retryCount: 3,
        maxRetries: 3,
        testOutput: '1 test failed in app-tui.test.ts'
      }
    };
    const { lastFrame } = render(React.createElement(App, { initialState: escalationState }));
    const frame = lastFrame();

    expect(frame).toContain('ESCALATION REQUIRED: 4-5-create-hitl-approval-ui-component');
    expect(frame).toContain('Gate decision: ESCALATE_TO_HUMAN after 3 retries');
    expect(frame).toContain('1. Retry (same prompt)');
  });
});
