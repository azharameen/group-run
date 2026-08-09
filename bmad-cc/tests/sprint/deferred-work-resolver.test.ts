import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  loadDeferredWork,
  resolveDeferredTask,
  markDeferredTasksResolved
} from '../../src/sprint/deferred-work-resolver.js';

describe('DeferredWorkResolver', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-test-deferred-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads open deferred work items from deferred-work.md', async () => {
    const deferredFile = path.join(tempDir, 'deferred-work.md');
    await fs.writeFile(
      deferredFile,
      '# Deferred Work\n- [ ] Fix memory leak in logger (3-1)\n- [x] Clean up temp build artifacts\n- Refactor driver options'
    );

    const items = await loadDeferredWork(tempDir);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Fix memory leak');
    expect(items[1]).toContain('Refactor driver options');
  });

  it('queries a specific deferred task item without mutating disk (read-only)', async () => {
    const deferredFile = path.join(tempDir, 'deferred-work.md');
    const initialContent = '# Deferred Work\n- [ ] 4-1-create-interrupt-service\n- [ ] 4-2-add-heartbeat-monitor';
    await fs.writeFile(deferredFile, initialContent);

    const success = await resolveDeferredTask(tempDir, '4-1-create-interrupt-service');
    expect(success).toBe(true);

    const content = await fs.readFile(deferredFile, 'utf-8');
    // Read-only query helper does not mutate deferred-work.md on disk
    expect(content).toBe(initialContent);
  });

  it('queries multiple deferred tasks without mutating disk (read-only)', async () => {
    const deferredFile = path.join(tempDir, 'deferred-work.md');
    const initialContent = '# Deferred Work\n- [ ] Task A\n- [ ] Task B\n- [ ] Task C';
    await fs.writeFile(deferredFile, initialContent);

    const count = await markDeferredTasksResolved(tempDir, ['Task A', 'Task C']);
    expect(count).toBe(2);

    const content = await fs.readFile(deferredFile, 'utf-8');
    // Read-only query helper does not mutate deferred-work.md on disk
    expect(content).toBe(initialContent);
  });
});
