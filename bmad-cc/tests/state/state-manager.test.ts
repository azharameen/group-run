import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { StateManager, createInitialState } from '../../src/state/state-manager';
import { promises as fs } from 'fs';
import * as path from 'path';
import crypto from 'crypto';

describe('StateManager', () => {
  const baseDir = path.join(__dirname, '../.tmp/bmad-cc-state-test');
  let testDir: string;
  let manager: StateManager;

  beforeEach(async () => {
    testDir = path.join(baseDir, crypto.randomUUID());
    await fs.mkdir(testDir, { recursive: true });
    manager = new StateManager(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  afterAll(async () => {
    await fs.rm(baseDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
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
