import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { EscalationModal } from '../../src/tui/modals/escalation-modal.js';
import { QueryModal } from '../../src/tui/modals/query-modal.js';

describe('React Ink Modals (EscalationModal & QueryModal)', () => {
  it('renders EscalationModal with story details and action choices', () => {
    const mockContext = {
      storyKey: '4-5-create-hitl-approval-ui',
      reason: 'Gate decision: RETRY_WITH_FEEDBACK limit exceeded',
      retryCount: 3,
      maxRetries: 3,
      testOutput: 'FAIL src/app.test.ts (1 test failed)'
    };
    const handleDecision = vi.fn();

    const { lastFrame } = render(
      React.createElement(EscalationModal, {
        context: mockContext,
        onDecision: handleDecision
      })
    );

    const frame = lastFrame();
    expect(frame).toContain('ESCALATION REQUIRED: 4-5-create-hitl-approval-ui');
    expect(frame).toContain('Gate decision: RETRY_WITH_FEEDBACK limit exceeded');
    expect(frame).toContain('1. Retry (same prompt)');
    expect(frame).toContain('2. Retry with custom instructions');
  });

  it('renders QueryModal with raw sub-agent prompt and quick responses', () => {
    const handleAnswer = vi.fn();
    const { lastFrame } = render(
      React.createElement(QueryModal, {
        rawPrompt: 'Overwrite file src/index.ts? [y/N]',
        onAnswer: handleAnswer
      })
    );

    const frame = lastFrame();
    expect(frame).toContain('SUB-AGENT INTERACTIVE PROMPT');
    expect(frame).toContain('Overwrite file src/index.ts? [y/N]');
    expect(frame).toContain('[y] — Confirm / Yes');
    expect(frame).toContain('[n] — Cancel / No');
    expect(frame).toContain('[c] — Type Custom Answer');
  });

  it('renders EscalationModal with all 5 resolution actions', () => {
    const mockContext = {
      storyKey: '4-5-create-hitl-approval-ui',
      reason: 'Gate decision: RETRY_WITH_FEEDBACK limit exceeded',
      retryCount: 3,
      maxRetries: 3
    };
    const handleDecision = vi.fn();
    const { lastFrame } = render(
      React.createElement(EscalationModal, {
        context: mockContext,
        onDecision: handleDecision
      })
    );
    const frame = lastFrame();

    expect(frame).toContain('1. Retry (same prompt)');
    expect(frame).toContain('2. Retry with custom instructions');
    expect(frame).toContain('3. Override and pass');
    expect(frame).toContain('4. Skip this story');
    expect(frame).toContain('5. Abort entire sprint execution');
  });
});
