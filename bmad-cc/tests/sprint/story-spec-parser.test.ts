import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { parseStorySpec, getAcceptanceCriteriaCompletion } from '../../src/sprint/story-spec-parser.js';

vi.mock('fs/promises');

const mockStandardFormat = `---
baseline_commit: abc123def
---
# Story 4.1: Create Interrupt Management Service
Status: done

## Acceptance Criteria
- [x] Create the service
- [ ] Write unit tests
- [x] Expose an API

## Tasks / Subtasks
- [x] Scaffold file
- [ ] Implement methods
`;

const mockSpecDrivenFormat = `---
title: Spec Driven Story
type: feature
created: 2026-08-01
status: in-progress
baseline_revision: 987xyz
context:
  - path/to/file.ts
---
## Intent
To implement the new feature.

## Boundaries & Constraints
None

## Tasks / Acceptance Criteria
- [x] Initial setup
- [ ] First feature
- [ ] Integration tests
`;

describe('Story Spec Parser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should parse standard format story spec', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockStandardFormat);
    const spec = await parseStorySpec('d:/Projects/POC/ideator/_bmad-output/implementation-artifacts/4-1-create-interrupt-management-service.md');
    
    expect(spec.key).toBe('4-1-create-interrupt-management-service');
    expect(spec.title).toBe('Create Interrupt Management Service');
    expect(spec.baselineCommit).toBe('abc123def');
    expect(spec.acceptanceCriteria).toHaveLength(3);
    expect(spec.tasks).toHaveLength(2);
  });

  it('should parse spec-driven format story spec', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockSpecDrivenFormat);
    const spec = await parseStorySpec('4-2-spec-driven.md');
    
    expect(spec.key).toBe('4-2-spec-driven');
    expect(spec.title).toBe('Spec Driven Story');
    expect(spec.type).toBe('feature');
    expect(spec.contextPaths).toEqual(['path/to/file.ts']);
    expect(spec.intent).toBe('To implement the new feature.');
    expect(spec.acceptanceCriteria).toHaveLength(3);
    expect(spec.acceptanceCriteria[0].checked).toBe(true);
  });

  it('should calculate AC completion', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(mockStandardFormat);
    const spec = await parseStorySpec('file.md');
    
    const completion = getAcceptanceCriteriaCompletion(spec);
    expect(completion.total).toBe(3);
    expect(completion.completed).toBe(2);
    expect(completion.percentage).toBe(67);
  });
});
