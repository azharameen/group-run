import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { scanSkillManifests, parseSkillFrontmatter } from '../../src/supervisor/skill-manifest-scanner.js';

describe('skill-manifest-scanner', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-test-manifests-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parses YAML frontmatter from skill content', () => {
    const content = `---
name: bmad-custom-skill
description: 'A custom test skill for scanning'
prerequisites:
  - bmad-create-story
  - bmad-ux
phase: develop
---
# Body content
`;
    const result = parseSkillFrontmatter(content, '/path/SKILL.md', 'bmad-custom-skill');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('bmad-custom-skill');
    expect(result?.description).toBe('A custom test skill for scanning');
    expect(result?.prerequisites).toEqual(['bmad-create-story', 'bmad-ux']);
    expect(result?.phase).toBe('develop');
  });

  it('scans .agent/skills/*/SKILL.md directory recursively', async () => {
    const skill1Dir = path.join(tempDir, '.agent', 'skills', 'bmad-test-1');
    const skill2Dir = path.join(tempDir, '.agent', 'skills', 'bmad-test-2');
    await fs.mkdir(skill1Dir, { recursive: true });
    await fs.mkdir(skill2Dir, { recursive: true });

    await fs.writeFile(
      path.join(skill1Dir, 'SKILL.md'),
      '---\nname: bmad-test-1\ndescription: First test skill\nprerequisites: [bmad-create-story]\n---'
    );
    await fs.writeFile(
      path.join(skill2Dir, 'SKILL.md'),
      '---\nname: bmad-test-2\ndescription: Second test skill\nphase: review\n---'
    );

    const manifests = await scanSkillManifests(tempDir);
    expect(manifests.length).toBe(2);
    expect(manifests.find(m => m.name === 'bmad-test-1')?.description).toBe('First test skill');
    expect(manifests.find(m => m.name === 'bmad-test-2')?.phase).toBe('review');
  });

  it('returns empty array when .agent/skills directory does not exist', async () => {
    const manifests = await scanSkillManifests(tempDir);
    expect(manifests).toEqual([]);
  });
});
