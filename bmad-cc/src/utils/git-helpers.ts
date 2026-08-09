import { execa } from 'execa';

/**
 * Gets the current Git commit hash.
 * 
 * @param cwd Current working directory.
 * @returns The HEAD commit hash.
 */
export async function getCurrentCommitHash(cwd: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd });
  return stdout.trim();
}

/**
 * Gets the git diff from the base commit or current working tree.
 * 
 * @param cwd Current working directory.
 * @param baseSha Optional base commit SHA to diff against.
 * @returns The diff output.
 */
export async function getGitDiff(cwd: string, baseSha?: string): Promise<string> {
  const args = ['diff'];
  if (baseSha) {
    args.push(baseSha);
  }
  const { stdout } = await execa('git', args, { cwd });
  return stdout;
}

/**
 * Gets a list of changed files.
 * 
 * @param cwd Current working directory.
 * @returns Array of changed file paths.
 */
export async function getChangedFiles(cwd: string): Promise<string[]> {
  const { stdout } = await execa('git', ['diff', '--name-only'], { cwd });
  return stdout.split('\n').map(line => line.trim()).filter(Boolean);
}
