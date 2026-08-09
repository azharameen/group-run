import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  scanSkillManifests,
  parseSkillFrontmatter
} from '../../src/supervisor/skill-manifest-scanner.js';
import {
  parseCsvLine,
  parseBmadHelpCsv,
  loadBmadHelpCatalog,
  extractModuleMetaDocs
} from '../../src/supervisor/catalog-parser.js';
import {
  runBmadHelpDiscovery,
  parseBmadHelpDriverOutput,
  mapSkillNameToPhase,
  resolveSkillsFromCatalogAndManifests
} from '../../src/supervisor/bmad-help-discovery.js';
import {
  routeSkillsForStory,
  routeSkillsForStoryAsync,
  buildDynamicSkillCatalog,
  fallbackSkillRouting
} from '../../src/supervisor/skill-router.js';
import { AgentDriver, AgentSpawnOptions, AgentSessionResult } from '../../src/agent/driver-interface.js';

class FailingDriver extends AgentDriver {
  readonly name = 'failing-driver';
  readonly displayName = 'Failing Driver';
  getCommand(): string { return 'failing-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    throw new Error('Driver execution failed simulated');
  }
}

class MalformedJsonDriver extends AgentDriver {
  readonly name = 'malformed-driver';
  readonly displayName = 'Malformed Driver';
  getCommand(): string { return 'malformed-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 0,
      stdout: 'Here is recommendations: [ {"skillName": "bmad-dev-story", "phase": "develop" BROKEN_JSON',
      stderr: '',
      durationMs: 5,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

describe('Empirical Challenge M3 — Deep Stress Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-m3-stress-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. Skill Manifest Scanner Stress & Boundary Cases', () => {
    it('handles Windows CRLF line endings in YAML frontmatter', () => {
      const crlfContent = "---\r\nname: 'bmad-crlf-skill'\r\ndescription: \"CRLF line endings\"\r\nprerequisites:\r\n  - bmad-create-story\r\nphase: review\r\n---\r\n# Content";
      const parsed = parseSkillFrontmatter(crlfContent, '/path/SKILL.md', 'fallback-name');
      expect(parsed).not.toBeNull();
      expect(parsed?.name).toBe('bmad-crlf-skill');
      expect(parsed?.description).toBe('CRLF line endings');
      expect(parsed?.prerequisites).toEqual(['bmad-create-story']);
      expect(parsed?.phase).toBe('review');
    });

    it('handles preceded_by and preceded-by aliases in YAML frontmatter', () => {
      const content1 = "---\nname: skill-1\npreceded-by: bmad-create-story\n---";
      const parsed1 = parseSkillFrontmatter(content1, '/path/SKILL.md', 'skill-1');
      expect(parsed1?.prerequisites).toEqual(['bmad-create-story']);

      const content2 = "---\nname: skill-2\npreceded_by: [bmad-ux, bmad-architecture]\n---";
      const parsed2 = parseSkillFrontmatter(content2, '/path/SKILL.md', 'skill-2');
      expect(parsed2?.prerequisites).toEqual(['bmad-ux', 'bmad-architecture']);
    });

    it('gracefully handles missing frontmatter by using directory name', () => {
      const contentNoFrontmatter = "# Pure markdown file with no YAML frontmatter";
      const parsed = parseSkillFrontmatter(contentNoFrontmatter, '/path/SKILL.md', 'bmad-dir-name');
      expect(parsed).toEqual({
        name: 'bmad-dir-name',
        description: '',
        prerequisites: [],
        path: '/path/SKILL.md'
      });
    });

    it('ignores non-directory files inside .agent/skills/', async () => {
      const skillsDir = path.join(tempDir, '.agent', 'skills');
      await fs.mkdir(skillsDir, { recursive: true });

      // Create a regular file directly inside .agent/skills/ (not a dir)
      await fs.writeFile(path.join(skillsDir, 'stray-file.txt'), 'hello');

      // Create valid skill directory
      const validSkillDir = path.join(skillsDir, 'bmad-valid');
      await fs.mkdir(validSkillDir, { recursive: true });
      await fs.writeFile(path.join(validSkillDir, 'SKILL.md'), '---\nname: bmad-valid\n---');

      const scanned = await scanSkillManifests(tempDir);
      expect(scanned.length).toBe(1);
      expect(scanned[0].name).toBe('bmad-valid');
    });
  });

  describe('2. Catalog Parser Escaping & Robustness', () => {
    it('correctly handles escaped double quotes inside CSV fields', () => {
      const line = 'BMad Method,bmad-test,"Description with ""quoted text"" inside",DT';
      const fields = parseCsvLine(line);
      expect(fields[0]).toBe('BMad Method');
      expect(fields[1]).toBe('bmad-test');
      expect(fields[2]).toBe('Description with "quoted text" inside');
      expect(fields[3]).toBe('DT');
    });

    it('handles CSV missing header row cleanly', () => {
      const rawCsv = 'BMad Method,bmad-custom,Custom Display,CD,Custom Desc,,,,,false,,';
      const rows = parseBmadHelpCsv(rawCsv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-custom');
      expect(rows[0].displayName).toBe('Custom Display');
    });

    it('skips CSV lines with fewer than 2 fields', () => {
      const rawCsv = 'module,skill,display-name,menu-code\nsinglefield\nBMad Method,bmad-skill,Display,Code';
      const rows = parseBmadHelpCsv(rawCsv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-skill');
    });

    it('extracts module meta documentation links accurately', () => {
      const csv = `module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs
BMad Builder,_meta,,,,,,,,,false,https://docs.bmad-builder.com/llms.txt,
BMad Core,_meta,,,,,,,,,false,_bmad/core/llms.txt,
BMad Method,bmad-dev-story,Dev Story,,,,4-implementation,,,true,,`;

      const rows = parseBmadHelpCsv(csv);
      const docs = extractModuleMetaDocs(rows);
      expect(docs).toHaveLength(2);
      expect(docs[0]).toEqual({ module: 'BMad Builder', docsUrlOrPath: 'https://docs.bmad-builder.com/llms.txt' });
      expect(docs[1]).toEqual({ module: 'BMad Core', docsUrlOrPath: '_bmad/core/llms.txt' });
    });
  });

  describe('3. bmad-help Discovery Harness Resilience', () => {
    it('falls back to regex parsing when driver returns malformed JSON with skill names in text', () => {
      const malformedText = 'Recommended skills: bmad-create-story and bmad-dev-story should be used.';
      const result = parseBmadHelpDriverOutput(malformedText);
      expect(result).toHaveLength(2);
      expect(result[0].skillName).toBe('bmad-create-story');
      expect(result[1].skillName).toBe('bmad-dev-story');
    });

    it('handles driver throw / failure by falling back to catalog resolution without crashing', async () => {
      const driver = new FailingDriver();
      const res = await runBmadHelpDiscovery({
        storyKey: 'STORY-99',
        storyStatus: 'backlog',
        storyContent: '',
        epicStatus: 'in-progress',
        projectRoot: tempDir,
        driver
      });

      // When driver throws an exception, discoveredViaDriver is set to false
      expect(res.discoveredViaDriver).toBe(false);
      expect(res.recommendedSkills.length).toBeGreaterThan(0);
      expect(res.recommendedSkills[0].skillName).toBe('bmad-create-story');
    });

    it('handles driver returning invalid JSON syntax by falling back to regex matching', async () => {
      const driver = new MalformedJsonDriver();
      const res = await runBmadHelpDiscovery({
        storyKey: 'STORY-98',
        storyStatus: 'ready-for-dev',
        storyContent: 'Some spec',
        epicStatus: 'in-progress',
        projectRoot: tempDir,
        driver
      });

      expect(res.discoveredViaDriver).toBe(true);
      // Fallback regex extracted 'bmad-dev-story' from the broken string
      expect(res.recommendedSkills.some(s => s.skillName === 'bmad-dev-story')).toBe(true);
    });

    it('maps all expected skill name keywords to phases correctly', () => {
      expect(mapSkillNameToPhase('bmad-create-story')).toBe('create');
      expect(mapSkillNameToPhase('bmad-prd')).toBe('create');
      expect(mapSkillNameToPhase('bmad-product-brief')).toBe('create');
      expect(mapSkillNameToPhase('bmad-code-review')).toBe('review');
      expect(mapSkillNameToPhase('bmad-review-edge-case-hunter')).toBe('review');
      expect(mapSkillNameToPhase('bmad-retrospective')).toBe('retrospective');
      expect(mapSkillNameToPhase('bmad-qa-generate-e2e-tests')).toBe('test');
      expect(mapSkillNameToPhase('bmad-document-project')).toBe('document');
      expect(mapSkillNameToPhase('bmad-quick-dev')).toBe('develop');
    });
  });

  describe('4. Skill Router Integration & Dynamic Resolution', () => {
    it('combines native catalog, CSV rows, and scanned manifests without duplicating skills', () => {
      const manifests = [
        { name: 'bmad-dev-story', description: 'Scanned dev story', prerequisites: [], path: '/p' },
        { name: 'bmad-new-skill', description: 'Brand new skill', prerequisites: ['bmad-create-story'], path: '/p' }
      ];

      const catalogRows = [
        {
          module: 'Mod',
          skill: 'bmad-dev-story',
          displayName: 'Dev',
          menuCode: 'DS',
          description: 'CSV description',
          action: '',
          args: '',
          phase: '4-implementation',
          precededBy: 'bmad-create-story',
          followedBy: '',
          required: true,
          outputLocation: '',
          outputs: ''
        }
      ];

      const catalog = buildDynamicSkillCatalog(manifests, catalogRows);
      const devStory = catalog.find(c => c.name === 'bmad-dev-story');
      const newSkill = catalog.find(c => c.name === 'bmad-new-skill');

      expect(devStory?.description).toBe('Scanned dev story');
      expect(devStory?.required).toBe(true);
      expect(newSkill?.name).toBe('bmad-new-skill');
      expect(newSkill?.precededBy).toBe('bmad-create-story');
    });

    it('triggers bmad-help discovery when story status is ambiguous or missing spec in dev', async () => {
      const configDir = path.join(tempDir, '_bmad', '_config');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, 'bmad-help.csv'),
        'module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs\nBMad Method,bmad-create-story,Create Story,CS,Create,,,4-implementation,,,true,,'
      );

      // Status is 'blocked' (ambiguous)
      const skillsAmbiguous = await routeSkillsForStoryAsync(
        'STORY-50',
        'blocked',
        '',
        'in-progress',
        false,
        { projectRoot: tempDir, enableBmadHelpDiscovery: true }
      );

      expect(skillsAmbiguous.length).toBeGreaterThan(0);
      expect(skillsAmbiguous[0].skillName).toBe('bmad-create-story');
    });
  });
});
