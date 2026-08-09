import { describe, it, expect } from 'vitest';
import {
  runBmadHelpDiscovery,
  parseBmadHelpDriverOutput,
  mapSkillNameToPhase,
  resolveSkillsFromCatalogAndManifests
} from '../../src/supervisor/bmad-help-discovery.js';
import type { BmadHelpCatalogRow } from '../../src/supervisor/catalog-parser.js';
import type { ScannedSkillManifest } from '../../src/supervisor/skill-manifest-scanner.js';
import { AgentDriver, AgentSessionResult, AgentSpawnOptions } from '../../src/agent/driver-interface.js';

class MockHelpDriver extends AgentDriver {
  readonly name = 'mock-help';
  readonly displayName = 'Mock Help Driver';

  constructor(private responseText: string) {
    super();
  }

  getCommand(): string {
    return 'mock-help';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 0,
      stdout: this.responseText,
      stderr: '',
      durationMs: 10,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

describe('bmad-help-discovery', () => {
  it('maps skill names to standard supervisor phases', () => {
    expect(mapSkillNameToPhase('bmad-create-story')).toBe('create');
    expect(mapSkillNameToPhase('bmad-dev-story')).toBe('develop');
    expect(mapSkillNameToPhase('bmad-code-review')).toBe('review');
    expect(mapSkillNameToPhase('bmad-retrospective')).toBe('retrospective');
    expect(mapSkillNameToPhase('bmad-teach-me-testing')).toBe('test');
  });

  it('parses JSON output from /bmad-help driver execution', () => {
    const driverOutput = `
Here is the recommended workflow:
[
  { "skillName": "bmad-architecture", "phase": "develop", "priority": -1, "reason": "Requires system design", "required": true },
  { "skillName": "bmad-dev-story", "phase": "develop", "priority": 0, "reason": "Execute dev", "required": true }
]
`;
    const skills = parseBmadHelpDriverOutput(driverOutput);
    expect(skills.length).toBe(2);
    expect(skills[0].skillName).toBe('bmad-architecture');
    expect(skills[1].skillName).toBe('bmad-dev-story');
  });

  it('parses text response from /bmad-help driver execution via regex fallback', () => {
    const driverOutput = 'I recommend running bmad-create-story first, followed by bmad-dev-story and bmad-code-review.';
    const skills = parseBmadHelpDriverOutput(driverOutput);
    expect(skills.length).toBe(3);
    expect(skills.map(s => s.skillName)).toEqual(['bmad-create-story', 'bmad-dev-story', 'bmad-code-review']);
  });

  it('resolves skill sequence dynamically from catalog rows and manifests when driver is absent', () => {
    const catalogRows: BmadHelpCatalogRow[] = [
      {
        module: 'BMad Method',
        skill: 'bmad-create-story',
        displayName: 'Create Story',
        menuCode: 'CS',
        description: 'Story cycle start',
        action: '',
        args: '',
        phase: '4-implementation',
        precededBy: '',
        followedBy: '',
        required: true,
        outputLocation: '',
        outputs: ''
      }
    ];

    const manifests: ScannedSkillManifest[] = [
      {
        name: 'bmad-create-story',
        description: 'Create story spec',
        prerequisites: [],
        path: '/path/SKILL.md'
      }
    ];

    const skills = resolveSkillsFromCatalogAndManifests(
      {
        storyKey: 'STORY-100',
        storyStatus: 'backlog',
        storyContent: '',
        epicStatus: 'in-progress',
        projectRoot: '/tmp'
      },
      catalogRows,
      manifests
    );

    expect(skills.length).toBe(1);
    expect(skills[0].skillName).toBe('bmad-create-story');
  });

  it('spawns CLI driver executing /bmad-help for discovery', async () => {
    const mockResponse = JSON.stringify([
      { skillName: 'bmad-dev-story', phase: 'develop', priority: 0, reason: 'Proceed to dev', required: true }
    ]);
    const driver = new MockHelpDriver(mockResponse);

    const res = await runBmadHelpDiscovery({
      storyKey: 'STORY-101',
      storyStatus: 'ready-for-dev',
      storyContent: 'Spec ready',
      epicStatus: 'in-progress',
      projectRoot: '/tmp',
      driver
    });

    expect(res.discoveredViaDriver).toBe(true);
    expect(res.recommendedSkills.length).toBe(1);
    expect(res.recommendedSkills[0].skillName).toBe('bmad-dev-story');
  });
});
