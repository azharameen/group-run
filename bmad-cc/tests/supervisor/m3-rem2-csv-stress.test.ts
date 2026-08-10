import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  parseCsvLine,
  splitCsvLines,
  parseBmadHelpCsv,
  loadBmadHelpCatalog,
  extractModuleMetaDocs
} from '../../src/supervisor/catalog-parser.js';
import {
  runBmadHelpDiscovery,
  parseBmadHelpDriverOutput,
  resolveSkillsFromCatalogAndManifests
} from '../../src/supervisor/bmad-help-discovery.js';
import { AgentDriver, AgentSpawnOptions, AgentSessionResult } from '../../src/agent/driver-interface.js';

// Drivers for testing throw conditions
class SyncThrowingDriver extends AgentDriver {
  readonly name = 'sync-throwing-driver';
  readonly displayName = 'Sync Throwing Driver';
  getCommand(): string { return 'throw'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    throw new Error('Simulated synchronous driver failure');
  }
}

class NonErrorThrowingDriver extends AgentDriver {
  readonly name = 'non-error-throwing-driver';
  readonly displayName = 'Non-Error Throwing Driver';
  getCommand(): string { return 'throw-string'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw 'Simulated primitive string throw';
  }
}

class NullResultDriver extends AgentDriver {
  readonly name = 'null-result-driver';
  readonly displayName = 'Null Result Driver';
  getCommand(): string { return 'null'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return null as unknown as AgentSessionResult;
  }
}

class GarbageOutputDriver extends AgentDriver {
  readonly name = 'garbage-driver';
  readonly displayName = 'Garbage Output Driver';
  getCommand(): string { return 'garbage'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 1,
      stdout: '<html><body>500 Internal Server Error</body></html>\nFatal: failed to complete operation',
      stderr: 'Traceback (most recent call last):\n  File "main.py", line 1, in <module>',
      durationMs: 10,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

describe('M3 Remediation 2 — Comprehensive CSV Parser & Driver Throw Stress Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-m3-rem2-stress-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. parseCsvLine Corrupted & Edge Inputs', () => {
    it('handles unclosed quotes at end of line without crashing', () => {
      const unclosed = 'BMad Method,bmad-prd,"Unclosed quoted string description';
      const fields = parseCsvLine(unclosed);
      expect(fields).toEqual(['BMad Method', 'bmad-prd', 'Unclosed quoted string description']);
    });

    it('handles consecutive escaped quotes inside double quotes', () => {
      const line = 'BMad,"skill with ""quoted"" words and ""nested"" quotes",code';
      const fields = parseCsvLine(line);
      expect(fields).toEqual(['BMad', 'skill with "quoted" words and "nested" quotes', 'code']);
    });

    it('handles line with only multiple double quotes """""', () => {
      const line = '"""""';
      const fields = parseCsvLine(line);
      expect(fields).toBeDefined();
      expect(Array.isArray(fields)).toBe(true);
    });

    it('handles empty line and whitespace-only line', () => {
      expect(parseCsvLine('')).toEqual(['']);
      expect(parseCsvLine('   ')).toEqual(['']);
    });

    it('handles lines with consecutive commas (missing fields)', () => {
      const line = 'BMad,,,,,code';
      const fields = parseCsvLine(line);
      expect(fields).toEqual(['BMad', '', '', '', '', 'code']);
    });

    it('handles leading and trailing whitespace around quoted and unquoted fields', () => {
      const line = '  BMad  ,  "  Quoted Value  "  ,  unquoted  ';
      const fields = parseCsvLine(line);
      expect(fields).toEqual(['BMad', 'Quoted Value', 'unquoted']);
    });

    it('handles non-ASCII, unicode, and emoji characters', () => {
      const line = 'BMad,bmad-emoji,😀 😃 😄,code,"Special chars: \t \0 \u001b[32m"';
      const fields = parseCsvLine(line);
      expect(fields[0]).toBe('BMad');
      expect(fields[1]).toBe('bmad-emoji');
      expect(fields[2]).toBe('😀 😃 😄');
      expect(fields[4]).toContain('Special chars:');
    });
  });

  describe('2. splitCsvLines Line Ending & Multiline Stress', () => {
    it('returns empty array for empty string or whitespace-only inputs', () => {
      expect(splitCsvLines('')).toEqual([]);
      expect(splitCsvLines('   \n\r\n \t ')).toEqual([]);
    });

    it('handles CRLF, LF, and CR line endings correctly', () => {
      const csv = 'line1\r\nline2\nline3\rline4';
      const lines = splitCsvLines(csv);
      expect(lines).toEqual(['line1', 'line2', 'line3', 'line4']);
    });

    it('preserves newlines within quoted fields', () => {
      const csv = 'mod,skill,desc\nBMad,bmad-multiline,"Line 1\nLine 2\r\nLine 3",code';
      const lines = splitCsvLines(csv);
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain('Line 1\nLine 2\r\nLine 3');
    });

    it('handles trailing newlines cleanly', () => {
      const csv = 'line1\nline2\n\n\n';
      const lines = splitCsvLines(csv);
      expect(lines).toEqual(['line1', 'line2']);
    });

    it('handles unclosed quote across line boundaries', () => {
      const csv = 'header1,header2\nBMad,"Unclosed multiline\nline2';
      const lines = splitCsvLines(csv);
      expect(lines.length).toBe(2);
    });
  });

  describe('3. parseBmadHelpCsv Corrupted Content & Missing Fields', () => {
    it('returns [] for null, undefined, non-string inputs', () => {
      expect(parseBmadHelpCsv(null as unknown as string)).toEqual([]);
      expect(parseBmadHelpCsv(undefined as unknown as string)).toEqual([]);
      expect(parseBmadHelpCsv(12345 as unknown as string)).toEqual([]);
      expect(parseBmadHelpCsv({} as unknown as string)).toEqual([]);
    });

    it('returns [] for empty string or header-only CSV', () => {
      expect(parseBmadHelpCsv('')).toEqual([]);
      expect(parseBmadHelpCsv('module,skill,display-name,menu-code')).toEqual([]);
    });

    it('ignores comment lines (# and //) before and after header', () => {
      const csv = `# This is a comment
// Another comment line
module,skill,display-name,menu-code
# Comment inside data
BMad Method,bmad-prd,PRD,P
// Another comment inside data
BMad Method,bmad-ux,UX,U
`;
      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(2);
      expect(rows[0].skill).toBe('bmad-prd');
      expect(rows[1].skill).toBe('bmad-ux');
    });

    it('parses CSV correctly when header row is omitted', () => {
      const csv = 'BMad Method,bmad-quick-dev,Quick Dev,QD,Quick Dev Description';
      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].module).toBe('BMad Method');
      expect(rows[0].skill).toBe('bmad-quick-dev');
      expect(rows[0].displayName).toBe('Quick Dev');
    });

    it('handles missing fields gracefully by substituting defaults', () => {
      // Line with only 2 fields: module and skill
      const csv = 'BMad Method,bmad-minimal';
      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].module).toBe('BMad Method');
      expect(rows[0].skill).toBe('bmad-minimal');
      expect(rows[0].displayName).toBe('');
      expect(rows[0].required).toBe(false);
    });

    it('skips lines with fewer than 2 fields or lines where both module and skill are blank', () => {
      const csv = `module,skill,display-name
SingleFieldOnly
, , display name with no module or skill
,
BMad Method,bmad-valid,Valid Display Name`;
      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-valid');
    });

    it('parses boolean required field correctly across variations', () => {
      const csv = `module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required
Mod,skill-true,Display,,,,,,,,true
Mod,skill-TRUE,Display,,,,,,,,TRUE
Mod,skill-false,Display,,,,,,,,false
Mod,skill-invalid,Display,,,,,,,,random_string`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(4);
      expect(rows[0].required).toBe(true);
      expect(rows[1].required).toBe(true);
      expect(rows[2].required).toBe(false);
      expect(rows[3].required).toBe(false);
    });

    it('handles extra columns beyond expected 13 fields without throwing', () => {
      const csv = 'Mod,skill,Display,Code,Desc,Act,Args,Phase,Pre,Fol,true,OutLoc,Outs,ExtraCol1,ExtraCol2,ExtraCol3';
      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('skill');
      expect(rows[0].required).toBe(true);
      expect(rows[0].outputs).toBe('Outs');
    });
  });

  describe('4. loadBmadHelpCatalog File System Resilience', () => {
    it('returns [] when projectRoot does not contain _bmad/_config/bmad-help.csv', async () => {
      const catalog = await loadBmadHelpCatalog(tempDir);
      expect(catalog).toEqual([]);
    });

    it('returns [] when _bmad/_config/bmad-help.csv is a directory instead of a file', async () => {
      const dirPath = path.join(tempDir, '_bmad', '_config', 'bmad-help.csv');
      await fs.mkdir(dirPath, { recursive: true });

      const catalog = await loadBmadHelpCatalog(tempDir);
      expect(catalog).toEqual([]);
    });

    it('loads and parses file correctly when valid', async () => {
      const configDir = path.join(tempDir, '_bmad', '_config');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, 'bmad-help.csv'),
        'module,skill,display-name\nBMad,bmad-test,Test Skill'
      );

      const catalog = await loadBmadHelpCatalog(tempDir);
      expect(catalog.length).toBe(1);
      expect(catalog[0].skill).toBe('bmad-test');
    });
  });

  describe('5. Driver Throw Conditions & Fallback Mechanisms', () => {
    it('handles driver throwing Error by falling back to catalog resolution', async () => {
      const driver = new SyncThrowingDriver();
      const result = await runBmadHelpDiscovery({
        storyKey: 'STORY-ERR-1',
        storyStatus: 'backlog',
        storyContent: '',
        epicStatus: 'in-progress',
        projectRoot: tempDir,
        driver
      });

      expect(result.discoveredViaDriver).toBe(false);
      expect(result.recommendedSkills.length).toBeGreaterThan(0);
      expect(result.recommendedSkills[0].skillName).toBe('bmad-create-story');
    });

    it('handles driver throwing primitive non-Error value cleanly', async () => {
      const driver = new NonErrorThrowingDriver();
      const result = await runBmadHelpDiscovery({
        storyKey: 'STORY-ERR-2',
        storyStatus: 'backlog',
        storyContent: '',
        epicStatus: 'in-progress',
        projectRoot: tempDir,
        driver
      });

      expect(result.discoveredViaDriver).toBe(false);
      expect(result.recommendedSkills.length).toBeGreaterThan(0);
    });

    it('handles driver returning null session result cleanly', async () => {
      const driver = new NullResultDriver();
      const result = await runBmadHelpDiscovery({
        storyKey: 'STORY-ERR-3',
        storyStatus: 'backlog',
        storyContent: '',
        epicStatus: 'in-progress',
        projectRoot: tempDir,
        driver
      });

      expect(result.discoveredViaDriver).toBe(false);
      expect(result.recommendedSkills.length).toBeGreaterThan(0);
    });

    it('handles driver returning garbage/HTML error output without crashing', async () => {
      const driver = new GarbageOutputDriver();
      const result = await runBmadHelpDiscovery({
        storyKey: 'STORY-ERR-4',
        storyStatus: 'ready-for-dev',
        storyContent: 'Build login screen',
        epicStatus: 'in-progress',
        projectRoot: tempDir,
        driver
      });

      // No skill names like bmad-xxx in HTML 500 error output, so falls back to catalog
      expect(result.discoveredViaDriver).toBe(false);
      expect(result.recommendedSkills.length).toBeGreaterThan(0);
      expect(result.recommendedSkills[0].skillName).toBe('bmad-dev-story');
    });

    it('parseBmadHelpDriverOutput filters non-string / invalid objects in JSON output', () => {
      const jsonOutput = `Here is JSON: [123, "not-object", null, {"skillName": 999}, {"skillName": "bmad-valid-skill", "priority": "not-a-number"}]`;
      const parsed = parseBmadHelpDriverOutput(jsonOutput);
      expect(parsed.length).toBe(1);
      expect(parsed[0].skillName).toBe('bmad-valid-skill');
      expect(parsed[0].priority).toBe(0); // Defaulted fallback priority
    });
  });
});
