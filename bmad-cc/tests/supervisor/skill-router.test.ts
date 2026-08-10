import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  routeSkillsForStory,
  routeSkillsForStoryAsync,
  buildDynamicSkillCatalog,
  fallbackSkillRouting
} from '../../src/supervisor/skill-router.js';

describe('skill-router', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-test-router-'));
  });

  afterEach(async () => {
    let retries = 5;
    while (retries > 0) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        break;
      } catch {
        retries--;
        if (retries === 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  });

  it('routes backlog to bmad-create-story', () => {
    const skills = routeSkillsForStory('STORY-1', 'backlog', '', 'in-progress', false);
    expect(skills.length).toBe(1);
    expect(skills[0].skillName).toBe('bmad-create-story');
  });

  it('routes ready-for-dev to bmad-dev-story', () => {
    const skills = routeSkillsForStory('STORY-2', 'ready-for-dev', 'simple content', 'in-progress', false);
    expect(skills.find(s => s.skillName === 'bmad-dev-story')).toBeDefined();
  });

  it('routes review to bmad-code-review', () => {
    const skills = routeSkillsForStory('STORY-3', 'review', '', 'in-progress', false);
    expect(skills[0].skillName).toBe('bmad-code-review');
  });

  it('detects UI keywords and adds bmad-ux', () => {
    const skills = routeSkillsForStory('STORY-4', 'ready-for-dev', 'This is a UI component for the layout page', 'in-progress', false);
    expect(skills.find(s => s.skillName === 'bmad-ux')).toBeDefined();
  });

  it('adds retrospective when all stories are done', () => {
    const skills = routeSkillsForStory('STORY-5', 'done', '', 'done', true);
    expect(skills.find(s => s.skillName === 'bmad-retrospective')).toBeDefined();
  });

  it('handles unknown story status with empty spec by falling back to bmad-create-story', () => {
    const skills = routeSkillsForStory('STORY-6', 'unknown-status', '', 'in-progress', false);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].skillName).toBe('bmad-create-story');
  });

  it('handles unknown story status with existing spec by falling back to bmad-dev-story', () => {
    const skills = routeSkillsForStory('STORY-7', 'draft', 'story spec content', 'in-progress', false);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.find(s => s.skillName === 'bmad-dev-story')).toBeDefined();
  });

  it('builds dynamic skill catalog from manifests and CSV rows', () => {
    const catalog = buildDynamicSkillCatalog(
      [
        {
          name: 'bmad-custom-agent',
          description: 'Custom agent description',
          prerequisites: ['bmad-create-story'],
          path: '/path'
        }
      ],
      [
        {
          module: 'Custom Module',
          skill: 'bmad-custom-agent',
          displayName: 'Custom Agent',
          menuCode: 'CA',
          description: 'Custom description from CSV',
          action: 'custom',
          args: '',
          phase: '3-solutioning',
          precededBy: 'bmad-create-story',
          followedBy: 'bmad-dev-story',
          required: true,
          outputLocation: '',
          outputs: ''
        }
      ]
    );

    const customEntry = catalog.find(c => c.name === 'bmad-custom-agent');
    expect(customEntry).toBeDefined();
    expect(customEntry?.description).toBe('Custom agent description');
    expect(customEntry?.required).toBe(true);
  });

  it('routeSkillsForStoryAsync dynamically loads manifests and bmad-help catalog from disk', async () => {
    const configDir = path.join(tempDir, '_bmad', '_config');
    const skillsDir = path.join(tempDir, '.agent', 'skills', 'bmad-dynamic-test');
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });

    await fs.writeFile(
      path.join(configDir, 'bmad-help.csv'),
      'module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs\nBMad Method,bmad-dynamic-test,Dynamic Skill,DS,Dynamic skill from CSV,,,4-implementation,bmad-create-story,,true,,'
    );

    await fs.writeFile(
      path.join(skillsDir, 'SKILL.md'),
      '---\nname: bmad-dynamic-test\ndescription: Dynamic test skill\n---\n'
    );

    const skills = await routeSkillsForStoryAsync(
      'STORY-8',
      'ready-for-dev',
      'Content mentioning UI component',
      'in-progress',
      false,
      { projectRoot: tempDir }
    );

    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some(s => s.skillName === 'bmad-dev-story' || s.skillName === 'bmad-dynamic-test')).toBe(true);
  });
});
