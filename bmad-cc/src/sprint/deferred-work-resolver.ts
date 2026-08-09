import fs from 'fs/promises';
import path from 'path';
import { fileExists } from '../utils/file-helpers.js';

export interface DeferredWorkItem {
  id: string;
  description: string;
  resolved: boolean;
}

export async function getDeferredWorkPath(projectRoot: string): Promise<string> {
  return path.join(projectRoot, 'deferred-work.md');
}

/**
 * Loads open/unresolved deferred work items from deferred-work.md.
 * Read-only helper.
 */
export async function loadDeferredWork(projectRoot: string): Promise<string[]> {
  const filePath = await getDeferredWorkPath(projectRoot);
  if (!(await fileExists(filePath))) {
    return [];
  }
  const content = await fs.readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => (line.startsWith('-') || line.startsWith('*')) && !line.toLowerCase().includes('[x]'));
}

/**
 * READ-ONLY QUERY HELPER:
 * Checks whether a specified deferred task item exists in deferred-work.md.
 * Direct programmatic writes to deferred-work.md are removed. Updates to deferred-work.md
 * are executed natively by BMad skills within CLI driver agent sessions.
 */
export async function resolveDeferredTask(projectRoot: string, taskIdentifier: string): Promise<boolean> {
  const filePath = await getDeferredWorkPath(projectRoot);
  if (!(await fileExists(filePath))) {
    return false;
  }
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  return lines.some(line => {
    const trimmed = line.trim();
    return (
      (trimmed.startsWith('-') || trimmed.startsWith('*')) &&
      line.includes(taskIdentifier)
    );
  });
}

/**
 * READ-ONLY QUERY HELPER:
 * Counts matching open deferred tasks in deferred-work.md without performing file writes.
 */
export async function markDeferredTasksResolved(
  projectRoot: string,
  resolvedItems: string[]
): Promise<number> {
  let count = 0;
  for (const item of resolvedItems) {
    const found = await resolveDeferredTask(projectRoot, item);
    if (found) count++;
  }
  return count;
}
