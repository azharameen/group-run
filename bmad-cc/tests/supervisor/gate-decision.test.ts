import { describe, it, expect } from 'vitest';
import { makeGateDecision } from '../../src/supervisor/gate-decision.js';
import type { EvaluationReport } from '../../src/supervisor/result-evaluator.js';

describe('gate-decision', () => {
  const baseEval: EvaluationReport = {
    storyKey: 'STORY-1',
    phase: 'develop',
    testsRan: true,
    testsPassed: true,
    testOutput: 'All passing',
    reviewFindings: { critical: 0, high: 0, medium: 0, low: 0 },
    acCompletion: { total: 5, completed: 5, percentage: 100 },
    gitDiffLineCount: 10,
    filesChanged: ['a.ts'],
    errors: []
  };

  it('approves when everything is good and transitions targetStatus from in-progress to review', () => {
    const decision = makeGateDecision(baseEval, 0, 3, 'in-progress');
    expect(decision.decision).toBe('APPROVE');
    expect(decision.targetStatus).toBe('review');
  });

  it('transitions targetStatus from backlog to ready-for-dev upon create phase approval', () => {
    const createEval = { ...baseEval, phase: 'create' };
    const decision = makeGateDecision(createEval, 0, 3, 'backlog');
    expect(decision.decision).toBe('APPROVE');
    expect(decision.targetStatus).toBe('ready-for-dev');
  });

  it('transitions targetStatus from review to done upon review phase approval', () => {
    const reviewEval = { ...baseEval, phase: 'review' };
    const decision = makeGateDecision(reviewEval, 0, 3, 'review');
    expect(decision.decision).toBe('APPROVE');
    expect(decision.targetStatus).toBe('done');
  });

  it('retries when tests fail on first try and preserves targetStatus', () => {
    const failedEval = { ...baseEval, testsPassed: false, errors: ['Tests failed'] };
    const decision = makeGateDecision(failedEval, 0, 3, 'in-progress');
    expect(decision.decision).toBe('RETRY_WITH_FEEDBACK');
    expect(decision.targetStatus).toBe('in-progress');
  });

  it('transitions targetStatus back to in-progress when review fails during review phase', () => {
    const reviewFailEval = {
      ...baseEval,
      phase: 'review',
      reviewFindings: { critical: 1, high: 0, medium: 0, low: 0 }
    };
    const decision = makeGateDecision(reviewFailEval, 0, 3, 'review');
    expect(decision.decision).toBe('RETRY_WITH_FEEDBACK');
    expect(decision.targetStatus).toBe('in-progress');
  });

  it('escalates when max retries exceeded and preserves current status', () => {
    const failedEval = { ...baseEval, testsPassed: false, errors: ['Tests failed'] };
    const decision = makeGateDecision(failedEval, 3, 3, 'in-progress');
    expect(decision.decision).toBe('ESCALATE_TO_HUMAN');
    expect(decision.targetStatus).toBe('in-progress');
  });
});
