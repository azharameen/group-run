import fs from 'fs/promises';
import path from 'path';

export interface SupervisorContext {
  projectName: string;
  prdSummary: string | null;
  architectureSummary: string | null;
  uxSpecSummary: string | null;
  sprintOverview: string;
  previousRetroLearnings: string[];
  deferredWorkItems: string[];
  recentCompletedStories: string[];
}

async function truncateFile(filePath: string, maxLines: number): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(0, maxLines).join('\n');
  } catch (err) {
    return null;
  }
}

async function findFirstFile(dir: string, ext: string): Promise<string | null> {
  try {
    const files = await fs.readdir(dir);
    const match = files.find(f => f.endsWith(ext));
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

/**
 * Gathers all relevant project documentation for the supervisor's context window.
 */
export async function assembleContext(projectRoot: string): Promise<SupervisorContext> {
  const prdDir = path.join(projectRoot, '_bmad-output', 'planning-artifacts', 'prds');
  const prdFile = await findFirstFile(prdDir, '.md');
  const prdSummary = prdFile ? await truncateFile(prdFile, 500) : null;

  const archDir = path.join(projectRoot, '_bmad-output', 'planning-artifacts', 'architecture');
  let archFile = path.join(archDir, 'ARCHITECTURE-SPINE.md');
  try {
    await fs.access(archFile);
  } catch {
    archFile = (await findFirstFile(archDir, '.md')) || '';
  }
  const architectureSummary = archFile ? await truncateFile(archFile, 500) : null;

  let uxSpecSummary = await truncateFile(path.join(projectRoot, 'docs', 'ui-design.md'), 300);
  if (!uxSpecSummary) {
    uxSpecSummary = await truncateFile(path.join(projectRoot, 'docs', 'frontend-plan.md'), 300);
  }

  const sprintOverview = (await truncateFile(path.join(projectRoot, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'), 500)) || '';

  const previousRetroLearnings: string[] = [];
  try {
    const implDir = path.join(projectRoot, '_bmad-output', 'implementation-artifacts');
    const files = await fs.readdir(implDir);
    for (const f of files) {
      if (f.startsWith('epic-') && f.includes('-retro-') && f.endsWith('.md')) {
        const retro = await truncateFile(path.join(implDir, f), 100);
        if (retro) previousRetroLearnings.push(retro);
      }
    }
  } catch {}

  const deferredFile = path.join(projectRoot, 'deferred-work.md');
  const deferredContent = await truncateFile(deferredFile, 1000);
  const deferredWorkItems = deferredContent ? deferredContent.split('\n').filter(l => l.trim().startsWith('-')) : [];

  const recentCompletedStories: string[] = []; 

  return {
    projectName: path.basename(projectRoot),
    prdSummary,
    architectureSummary,
    uxSpecSummary,
    sprintOverview,
    previousRetroLearnings,
    deferredWorkItems,
    recentCompletedStories
  };
}
