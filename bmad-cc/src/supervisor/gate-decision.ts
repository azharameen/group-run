import type { EvaluationReport } from './result-evaluator.js';

export type GateDecisionType = 'APPROVE' | 'RETRY_WITH_FEEDBACK' | 'ESCALATE_TO_HUMAN';

export interface GateDecision {
  decision: GateDecisionType;
  reason: string;
  feedback?: string;
  retryCount: number;
  maxRetries: number;
}

/**
 * Applies decision rules to determine story outcome.
 */
export function makeGateDecision(
  evaluation: EvaluationReport,
  retryCount: number,
  maxRetries: number
): GateDecision {
  const reviewOk = !evaluation.reviewFindings || 
    (evaluation.reviewFindings.critical === 0 && evaluation.reviewFindings.high === 0);
  
  if (evaluation.testsPassed && reviewOk && evaluation.acCompletion.percentage >= 80) {
    return {
      decision: 'APPROVE',
      reason: 'Tests passed, no critical/high review findings, and AC completion >= 80%.',
      retryCount,
      maxRetries
    };
  }

  if (retryCount >= maxRetries) {
    return {
      decision: 'ESCALATE_TO_HUMAN',
      reason: `Max retries (${maxRetries}) exceeded. Errors: ${evaluation.errors.join(', ')}`,
      retryCount,
      maxRetries
    };
  }

  const feedbackParts = [];
  if (!evaluation.testsPassed) {
    feedbackParts.push(`Test failure output: ${evaluation.testOutput.substring(0, 2000)}`);
  }
  if (!reviewOk) {
    feedbackParts.push(`Review findings found: Critical/High issues need resolution.`);
  }
  if (evaluation.acCompletion.percentage < 80) {
    feedbackParts.push(`AC completion too low (${evaluation.acCompletion.percentage}%). Please complete all remaining Acceptance Criteria.`);
  }

  return {
    decision: 'RETRY_WITH_FEEDBACK',
    reason: 'Criteria not met for approval, retrying with feedback.',
    feedback: feedbackParts.join('\n'),
    retryCount,
    maxRetries
  };
}
