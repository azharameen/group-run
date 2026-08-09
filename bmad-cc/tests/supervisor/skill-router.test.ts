import { describe, it, expect } from 'vitest';
import { routeSkillsForStory } from '../../src/supervisor/skill-router.js';

describe('skill-router', () => {
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
});
