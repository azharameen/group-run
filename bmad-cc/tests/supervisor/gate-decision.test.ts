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

  it('approves when everything is good', () => {
    const decision = makeGateDecision(baseEval, 0, 3);
    expect(decision.decision).toBe('APPROVE');
  });

  it('retries when tests fail on first try', () => {
    const failedEval = { ...baseEval, testsPassed: false, errors: ['Tests failed'] };
    const decision = makeGateDecision(failedEval, 0, 3);
    expect(decision.decision).toBe('RETRY_WITH_FEEDBACK');
  });

  it('escalates when max retries exceeded', () => {
    const failedEval = { ...baseEval, testsPassed: false, errors: ['Tests failed'] };
    const decision = makeGateDecision(failedEval, 3, 3);
    expect(decision.decision).toBe('ESCALATE_TO_HUMAN');
  });

  it('retries on critical review findings', () => {
    const reviewFailEval = { ...baseEval, reviewFindings: { critical: 1, high: 0, medium: 0, low: 0 } };
    const decision = makeGateDecision(reviewFailEval, 0, 3);
    expect(decision.decision).toBe('RETRY_WITH_FEEDBACK');
  });
});
