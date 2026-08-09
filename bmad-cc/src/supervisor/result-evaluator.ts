import fs from 'fs/promises';

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

/**
 * Evaluates the outcome of a story execution phase.
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
  const diffLines = gitDiff.split('\n').length;
  
  let reviewFindings = null;
  if (reviewOutput) {
    reviewFindings = {
      critical: (reviewOutput.match(/critical/gi) || []).length,
      high: (reviewOutput.match(/high/gi) || []).length,
      medium: (reviewOutput.match(/medium/gi) || []).length,
      low: (reviewOutput.match(/low/gi) || []).length
    };
  }

  let totalAc = 0;
  let completedAc = 0;
  try {
    const specContent = await fs.readFile(storySpecPath, 'utf-8');
    const acLines = specContent.split('\n').filter(l => l.trim().startsWith('- ['));
    totalAc = acLines.length;
    completedAc = acLines.filter(l => l.trim().startsWith('- [x]') || l.trim().startsWith('- [X]')).length;
  } catch {}

  const percentage = totalAc > 0 ? (completedAc / totalAc) * 100 : 100;

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
    errors: !testsPassed ? ['Tests failed'] : []
  };
}
