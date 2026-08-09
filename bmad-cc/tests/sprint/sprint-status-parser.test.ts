import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  parseSprintStatus,
  getEpicKeys,
  getStoryKeysForEpic,
  getStoriesByStatus,
  getNextActionableStory
} from '../../src/sprint/sprint-status-parser.js';

vi.mock('fs/promises');

const mockYamlContent = `
generated: 2026-08-02
last_updated: 2026-08-09
project: Companion
project_key: NOKEY
tracking_system: file-system
story_location: _bmad-output/implementation-artifacts

development_status:
  epic-0: done
  0-1-delete-backend-dead-code: done
  0-2-delete-frontend-dead-code: done
  epic-0-retrospective: done

  epic-1: done
  1-1-create-teams: done
  epic-1-retrospective: done

  epic-4: in-progress
  4-1-create-interrupt-management-service: done
  4-5-create-hitl-approval-ui-component: review
  4-6-wire-approval-ui: in-progress
  4-7-frontend-tests: backlog
  epic-4-retrospective: optional
`;

describe('Sprint Status Parser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should parse sprint status file correctly', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockYamlContent);
    const status = await parseSprintStatus('fake.yaml');
    
    expect(status.meta.project).toBe('Companion');
    expect(status.meta.generated).toBe('2026-08-02');
    expect(status.developmentStatus['4-7-frontend-tests']).toBe('backlog');
  });

  it('should extract epic keys', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockYamlContent);
    const status = await parseSprintStatus('fake.yaml');
    const keys = getEpicKeys(status);
    expect(keys).toEqual(['epic-0', 'epic-1', 'epic-4']);
  });

  it('should extract story keys for an epic', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockYamlContent);
    const status = await parseSprintStatus('fake.yaml');
    const stories = getStoryKeysForEpic(status, 'epic-4');
    expect(stories).toEqual([
      '4-1-create-interrupt-management-service',
      '4-5-create-hitl-approval-ui-component',
      '4-6-wire-approval-ui',
      '4-7-frontend-tests'
    ]);
  });

  it('should filter stories by status', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockYamlContent);
    const status = await parseSprintStatus('fake.yaml');
    const backlog = getStoriesByStatus(status, 'backlog');
    expect(backlog).toEqual(['4-7-frontend-tests']);
  });

  it('should find next actionable story', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockYamlContent);
    const status = await parseSprintStatus('fake.yaml');
    
    // In our mock, there's no ready-for-dev, so it should find the first backlog
    const next = getNextActionableStory(status);
    expect(next).toBe('4-7-frontend-tests');
    
    // Add a ready-for-dev story to test precedence
    status.developmentStatus['4-8-something'] = 'ready-for-dev';
    const nextWithReady = getNextActionableStory(status);
    expect(nextWithReady).toBe('4-8-something');
  });
});
