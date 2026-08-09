/**
 * gate-decision.ts
 *
 * Supervisor gate evaluation — decides whether a BMad skill execution
 * result should be APPROVED, retried with feedback, or escalated to human.
 *
 * STATUS TRANSITIONS ARE NOT MADE HERE.
 * Status updates are the responsibility of BMad agents (bmad-dev-story,
 * bmad-code-review, bmad-create-story) who write to sprint-status.yaml
 * natively as part of their skill execution. The gate only evaluates
 * artifact quality and decides whether to continue, retry, or escalate.
 */

import type { EvaluationReport } from './result-evaluator.js';

export type GateDecisionType = 'APPROVE' | 'RETRY_WITH_FEEDBACK' | 'ESCALATE_TO_HUMAN';

export interface GateDecision {
  decision: GateDecisionType;
  reason: string;
  feedback?: string;
  retryCount: number;
  maxRetries: number;
  /**
   * Advisory note for the next directive prompt — instructs the BMad agent
   * to update sprint-status.yaml if it has not already done so.
   * This is injected into the retry/continuation prompt, NOT applied programmatically.
   */
  statusUpdateNote?: string;
  targetStatus: string;
}

/**
 * Determines the target status transition based on decision, current status, and phase.
 */
function determineTargetStatus(
  currentStatus: string,
  phase: string,
  decision: GateDecisionType
): string {
  const s = currentStatus.toLowerCase().trim();

  if (decision === 'APPROVE') {
    if (s === 'backlog' || phase === 'create') {
      return 'ready-for-dev';
    }
    if (s === 'ready-for-dev' || s === 'in-progress' || phase === 'develop') {
      return 'review';
    }
    if (s === 'review' || phase === 'review') {
      return 'done';
    }
    return currentStatus;
  }

  if (decision === 'RETRY_WITH_FEEDBACK') {
    if (s === 'review' || phase === 'review') {
      return 'in-progress';
    }
    return currentStatus;
  }

  return currentStatus;
}

/**
 * Evaluates story execution artifacts to make a gate decision.
 * Does NOT apply any programmatic status mutations — those are handled
 * natively by the BMad agents themselves via their skill execution.
 */
export function makeGateDecision(
  evaluation: EvaluationReport,
  retryCount: number,
  maxRetries: number,
  currentStatus: string = 'in-progress'
): GateDecision {
  // Check if retry ceiling exceeded — escalate to human
  if (retryCount >= maxRetries) {
    const decision: GateDecisionType = 'ESCALATE_TO_HUMAN';
    return {
      decision,
      reason: `Max retries (${maxRetries}) exceeded. Unresolved issues: ${evaluation.errors.join(', ') || 'Quality criteria not satisfied'}`,
      retryCount,
      maxRetries,
      statusUpdateNote: undefined,
      targetStatus: determineTargetStatus(currentStatus, evaluation.phase, decision)
    };
  }

  const testsOk = !evaluation.testsRan || evaluation.testsPassed;
  const reviewOk =
    !evaluation.reviewFindings ||
    (evaluation.reviewFindings.critical === 0 && evaluation.reviewFindings.high === 0);

  if (testsOk && reviewOk) {
    const decision: GateDecisionType = 'APPROVE';
    // Approved — generate an advisory note for the directive prompt so the
    // BMad agent knows to mark the story complete in sprint-status.yaml if it hasn't already.
    const statusNote = buildStatusUpdateNote(currentStatus, evaluation.phase);

    return {
      decision,
      reason: 'Execution artifacts verified cleanly: tests passed and review findings resolved.',
      retryCount,
      maxRetries,
      statusUpdateNote: statusNote,
      targetStatus: determineTargetStatus(currentStatus, evaluation.phase, decision)
    };
  }

  // Build targeted retry feedback
  const feedbackParts: string[] = [];
  if (!testsOk) {
    feedbackParts.push(`Test failure output:\n${evaluation.testOutput.substring(0, 2000)}`);
  }
  if (!reviewOk) {
    feedbackParts.push(`Review findings: ${evaluation.reviewFindings!.critical} critical and ${evaluation.reviewFindings!.high} high severity issues require resolution before approval.`);
  }

  const decision: GateDecisionType = 'RETRY_WITH_FEEDBACK';
  return {
    decision,
    reason: 'Criteria not met for approval — retrying with synthesized feedback.',
    feedback: feedbackParts.join('\n'),
    retryCount,
    maxRetries,
    statusUpdateNote: undefined,
    targetStatus: determineTargetStatus(currentStatus, evaluation.phase, decision)
  };
}

/**
 * Builds an advisory note that is INJECTED into the next BMad agent directive
 * prompt, instructing it to update sprint-status.yaml natively.
 *
 * This is NOT a programmatic update — it is a natural language instruction
 * to the BMad agent that knows how to edit sprint-status.yaml itself.
 */
function buildStatusUpdateNote(currentStatus: string, phase: string): string {
  const s = currentStatus.toLowerCase().trim();

  if (s === 'backlog' || phase === 'create') {
    return `IMPORTANT: Now that the story spec has been created, update sprint-status.yaml to mark this story as "ready-for-dev" using the bmad sprint update conventions.`;
  }
  if (s === 'ready-for-dev' || s === 'in-progress') {
    return `IMPORTANT: Implementation is complete. Update sprint-status.yaml to mark this story as "review" using the bmad sprint update conventions.`;
  }
  if (s === 'review') {
    return `IMPORTANT: Review is complete and all findings resolved. Update sprint-status.yaml to mark this story as "done" using the bmad sprint update conventions.`;
  }
  return `IMPORTANT: Update sprint-status.yaml to reflect the current progress of this story using the bmad sprint update conventions.`;
}
