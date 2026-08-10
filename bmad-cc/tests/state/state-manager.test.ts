import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager, createInitialState } from '../../src/state/state-manager';
import { promises as fs } from 'fs';
import * as path from 'path';
import os from 'os';

describe('StateManager', () => {
  let testDir: string;
  let manager: StateManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-state-manager-test-'));
    manager = new StateManager(testDir);
  });

  afterEach(async () => {
    let retries = 5;
    while (retries > 0) {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
        break;
      } catch {
        retries--;
        if (retries === 0) break;
        await new Promise(r => setTimeout(r, 50));
      }
    }
  });

  it('createInitialState creates valid default state', () => {
    const state = createInitialState('test-driver');
    expect(state.version).toBe(1);
    expect(state.currentPhase).toBe('idle');
    expect(state.driverName).toBe('test-driver');
    expect(state.completedStories).toEqual([]);
    expect(state.skippedStories).toEqual([]);
  });

  it('load returns null if no state exists', async () => {
    const state = await manager.load();
    expect(state).toBeNull();
  });

  it('save and load state round-trip', async () => {
    const state = createInitialState('test-driver');
    await manager.save(state);
    
    const loaded = await manager.load();
    expect(loaded).toBeDefined();
    expect(loaded?.driverName).toBe('test-driver');
    expect(loaded?.version).toBe(1);
  });

  it('updatePhase updates phase', async () => {
    const state = createInitialState('test-driver');
    await manager.save(state);
    
    await manager.updatePhase('development');
    
    const loaded = await manager.load();
    expect(loaded?.currentPhase).toBe('development');
  });

  it('markStoryCompleted adds to completedStories', async () => {
    const state = createInitialState('test-driver');
    await manager.save(state);
    
    await manager.markStoryCompleted('STORY-1');
    
    const loaded = await manager.load();
    expect(loaded?.completedStories).toContain('STORY-1');
  });

  it('markStorySkipped adds to skippedStories', async () => {
    const state = createInitialState('test-driver');
    await manager.save(state);
    
    await manager.markStorySkipped('STORY-2');
    
    const loaded = await manager.load();
    expect(loaded?.skippedStories).toContain('STORY-2');
  });

  it('clear deletes the state file', async () => {
    const state = createInitialState('test-driver');
    await manager.save(state);
    
    await manager.clear();
    const loaded = await manager.load();
    expect(loaded).toBeNull();
  });
});
