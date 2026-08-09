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

  it('renders left tree panel, middle supervisor console, and right sub-sessions panel', () => {
    const { lastFrame } = render(React.createElement(App, { initialState: mockState }));
    const frame = lastFrame();

    expect(frame).toContain('BMad Command Center');
    expect(frame).toContain('Workstation');
    expect(frame).toContain('Sprint Epics');
    expect(frame).toContain('Supervisor Agent');
    expect(frame).toContain('Sub-Sessions');
    expect(frame).toContain('bmad-dev-story');
  });
});
