import fs from 'fs/promises';
import { auditAcceptanceCriteria } from '../verification/criteria-auditor.js';

export interface EvaluationReport {
  storyKey: string;
  phase: string;
  testsRan: boolean;
  testsPassed: boolean;
  testOutput: string;
  reviewFindings: { critical: number; high: number; medium: number; low: number } | null;
  acCompletion: { total: number; completed: number; percentage: number };
  gitDiffLineCount: number;
  filesChanged: string[];
  errors: string[];
}

function normalizeCategory(term: string): 'critical' | 'high' | 'medium' | 'low' | null {
  const t = term.toLowerCase();
  if (t === 'critical' || t === 'blocker') return 'critical';
  if (t === 'high' || t === 'major') return 'high';
  if (t === 'medium' || t === 'moderate') return 'medium';
  if (t === 'low' || t === 'minor' || t === 'info') return 'low';
  return null;
}

/**
 * Contextually parses review findings from review output text.
 * Ignores zero/negative count phrases (e.g. "Critical findings: 0", "No critical issues").
 */
export function parseReviewFindings(output: string): { critical: number; high: number; medium: number; low: number } {
  const findings = { critical: 0, high: 0, medium: 0, low: 0 };
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    // 1. Check for explicit numeric counts (e.g. "Critical findings: 0", "High: 2", "0 critical findings")
    const kvRegex = /\b(critical|blocker|high|major|medium|moderate|low|minor|info)\b(?:\s*(?:findings|issues|count))?\s*[:=-]\s*(\d+)/gi;
    let kvMatch: RegExpExecArray | null;
    let handledByCount = false;

    while ((kvMatch = kvRegex.exec(lower)) !== null) {
      handledByCount = true;
      const cat = normalizeCategory(kvMatch[1]);
      const count = parseInt(kvMatch[2], 10);
      if (cat && count > 0) {
        findings[cat] += count;
      }
    }

    const numFirstRegex = /\b(\d+)\s+(?:severity\s+)?(critical|blocker|high|major|medium|moderate|low|minor|info)\b/gi;
    let numMatch: RegExpExecArray | null;

    while ((numMatch = numFirstRegex.exec(lower)) !== null) {
      handledByCount = true;
      const count = parseInt(numMatch[1], 10);
      const cat = normalizeCategory(numMatch[2]);
      if (cat && count > 0) {
        findings[cat] += count;
      }
    }

    if (handledByCount) {
      continue;
    }

    // 2. Check for zero/negative statement phrases (e.g. "No critical issues identified", "No blockers found")
    const isZeroStatement =
      /\b(no|none|zero|without|clean|pass|passed)\b.*\b(critical|blocker|high|major|medium|moderate|low|minor|info)\b/i.test(lower) ||
      /\b(critical|blocker|high|major|medium|moderate|low|minor|info)\b.*\b(none|zero|n\/a)\b/i.test(lower);

    if (isZeroStatement) {
      continue;
    }

    // 3. Match qualitative finding lines (e.g. "- [Critical] Memory leak", "Severity: Critical - issue")
    if (/\b(critical|blocker|severity:\s*critical)\b/i.test(lower)) {
      findings.critical++;
    } else if (/\b(high|major|severity:\s*high)\b/i.test(lower)) {
      findings.high++;
    } else if (/\b(medium|moderate|severity:\s*medium)\b/i.test(lower)) {
      findings.medium++;
    } else if (/\b(low|minor|info|severity:\s*low)\b/i.test(lower)) {
      findings.low++;
    }
  }

  return findings;
}

/**
 * Agentically evaluates the outcome of a story execution phase.
 */
export async function evaluateResult(
  storyKey: string,
  phase: string,
  testExitCode: number,
  testOutput: string,
  gitDiff: string,
  changedFiles: string[],
  storySpecPath: string,
  reviewOutput?: string
): Promise<EvaluationReport> {
  const testsPassed = testExitCode === 0;
  const testsRan = testOutput.trim().length > 0;
  const diffLines = gitDiff.trim() ? gitDiff.split('\n').length : 0;

  let reviewFindings: { critical: number; high: number; medium: number; low: number } | null = null;
  if (reviewOutput && reviewOutput.trim()) {
    reviewFindings = parseReviewFindings(reviewOutput);
  }

  let totalAc = 0;
  let completedAc = 0;
  let percentage = 100;

  try {
    const specContent = await fs.readFile(storySpecPath, 'utf-8');
    const acAudit = auditAcceptanceCriteria(specContent);
    totalAc = acAudit.total;
    completedAc = acAudit.completed;
    percentage = acAudit.percentage;
  } catch {}

  const errors: string[] = [];
  if (!testsPassed) {
    errors.push('Verification test execution failed');
  }
  if (reviewFindings && (reviewFindings.critical > 0 || reviewFindings.high > 0)) {
    errors.push(`Review findings identified ${reviewFindings.critical} critical and ${reviewFindings.high} high severity issues`);
  }

  return {
    storyKey,
    phase,
    testsRan,
    testsPassed,
    testOutput,
    reviewFindings,
    acCompletion: { total: totalAc, completed: completedAc, percentage },
    gitDiffLineCount: diffLines,
    filesChanged: changedFiles,
    errors
  };
}

