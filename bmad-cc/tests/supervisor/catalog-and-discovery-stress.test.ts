import { describe, it, expect } from 'vitest';
import {
  parseCsvLine,
  splitCsvLines,
  parseBmadHelpCsv
} from '../../src/supervisor/catalog-parser.js';
import {
  runBmadHelpDiscovery,
  parseBmadHelpDriverOutput
} from '../../src/supervisor/bmad-help-discovery.js';
import { AgentDriver, AgentSpawnOptions, AgentSessionResult } from '../../src/agent/driver-interface.js';

// Drivers for testing failure modes
class ThrowingDriver extends AgentDriver {
  readonly name = 'throwing-driver';
  readonly displayName = 'Throwing Driver';
  getCommand(): string { return 'throwing-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    throw new Error('Fatal CLI driver process crash');
  }
}

class NonZeroExitDriver extends AgentDriver {
  readonly name = 'nonzero-driver';
  readonly displayName = 'Non-zero Exit Driver';
  getCommand(): string { return 'nonzero-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Error: Command failed with exit code 1',
      durationMs: 12,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

class NonZeroWithStderrSkillDriver extends AgentDriver {
  readonly name = 'nonzero-stderr-skill-driver';
  readonly displayName = 'Non-zero Stderr Skill Driver';
  getCommand(): string { return 'nonzero-stderr-skill-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 127,
      stdout: '',
      stderr: 'Failed to run command for bmad-dev-story: not found',
      durationMs: 15,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

class InvalidJsonDriver extends AgentDriver {
  readonly name = 'invalid-json-driver';
  readonly displayName = 'Invalid JSON Driver';
  getCommand(): string { return 'invalid-json-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 0,
      stdout: '<html><body>500 Server Error: Internal Driver Panic</body></html>',
      stderr: '',
      durationMs: 8,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

class ZeroSkillsDriver extends AgentDriver {
  readonly name = 'zero-skills-driver';
  readonly displayName = 'Zero Skills Driver';
  getCommand(): string { return 'zero-skills-driver'; }
  async isAvailable(): Promise<boolean> { return true; }
  async execute(_options: AgentSpawnOptions): Promise<AgentSessionResult> {
    return {
      exitCode: 0,
      stdout: '[]',
      stderr: '',
      durationMs: 5,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

describe('Empirical Verification: Catalog Parser Stress Tests', () => {
  describe('1. CSV field splitting with escaped double-quotes ("")', () => {
    it('parses field with escaped double quotes inside quoted string', () => {
      const line = 'BMad Method,bmad-test,"Description with ""quoted text"" inside",DT';
      const fields = parseCsvLine(line);
      expect(fields).toEqual([
        'BMad Method',
        'bmad-test',
        'Description with "quoted text" inside',
        'DT'
      ]);
    });

    it('parses field with multiple consecutive escaped double quotes', () => {
      const line = '"a""b""c""d",val2';
      const fields = parseCsvLine(line);
      expect(fields[0]).toBe('a"b"c"d');
      expect(fields[1]).toBe('val2');
    });

    it('parses empty quoted field cleanly', () => {
      const line = 'field1,"",field3';
      const fields = parseCsvLine(line);
      expect(fields).toEqual(['field1', '', 'field3']);
    });
  });

  describe('2. Quoted embedded newlines (\\n and \\r\\n)', () => {
    it('splits CSV lines preserving quoted newlines (\\n)', () => {
      const csv = `module,skill,displayName,menuCode,description
BMad Method,bmad-ux,UX Designer,UX,"Multi-line
description
line 3",action,args`;

      const lines = splitCsvLines(csv);
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain('Multi-line\ndescription\nline 3');
    });

    it('splits CSV lines preserving quoted Windows CRLF (\\r\\n)', () => {
      const csv = "module,skill,displayName,menuCode,description\r\nBMad Method,bmad-ux,UX Designer,UX,\"Line 1\r\nLine 2\",action,args";
      const lines = splitCsvLines(csv);
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain('Line 1\r\nLine 2');
    });

    it('parseBmadHelpCsv preserves embedded newlines within record fields', () => {
      const csv = `module,skill,displayName,menuCode,description
BMad Method,bmad-ux,UX Designer,UX,"Line 1
Line 2",action,args`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].description).toBe('Line 1\nLine 2');
    });
  });

  describe('3. Empty lines handling', () => {
    it('ignores leading, trailing, and intermediate empty lines and whitespace', () => {
      const csv = `

module,skill,displayName,menuCode,description

   
BMad Method,bmad-dev-story,Dev Story,DS,Execute dev


`;
      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-dev-story');
    });
  });

  describe('4. Single field lines handling', () => {
    it('skips single field lines during catalog row parsing', () => {
      const csv = `module,skill,displayName,menuCode,description
singlefieldline
BMad Method,bmad-dev-story,Dev Story,DS,Execute dev
another_single_field`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-dev-story');
    });
  });

  describe('5. Header detection logic', () => {
    it('detects standard header and skips header row', () => {
      const csv = `module,skill,displayName,menuCode,description
BMad Method,bmad-dev-story,Dev Story,DS,Execute dev`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-dev-story');
    });

    it('detects header case-insensitively', () => {
      const csv = `MODULE,SKILL,DISPLAYNAME,MENUCODE,DESCRIPTION
BMad Method,bmad-dev-story,Dev Story,DS,Execute dev`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-dev-story');
    });

    it('parses CSV data without header row without skipping the first data row', () => {
      const csv = `BMad Method,bmad-dev-story,Dev Story,DS,Execute dev`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-dev-story');
    });

    it('detects header even after comment lines and empty lines', () => {
      const csv = `# Comment line 1
// Comment line 2

module,skill,displayName,menuCode,description
BMad Method,bmad-dev-story,Dev Story,DS,Execute dev`;

      const rows = parseBmadHelpCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].skill).toBe('bmad-dev-story');
    });
  });
});

describe('Empirical Verification: bmad-help Discovery Stress Tests', () => {
  const defaultCtx = {
    storyKey: 'STORY-STRESS',
    storyStatus: 'backlog',
    storyContent: '',
    epicStatus: 'in-progress',
    projectRoot: '/tmp'
  };

  it('handles driver throwing an Error without crashing and falls back to catalog', async () => {
    const driver = new ThrowingDriver();
    const res = await runBmadHelpDiscovery({
      ...defaultCtx,
      driver
    });

    expect(res.discoveredViaDriver).toBe(false);
    expect(res.recommendedSkills.length).toBeGreaterThan(0);
    expect(res.recommendedSkills[0].skillName).toBe('bmad-create-story');
  });

  it('handles driver returning non-zero exit code without crashing and falls back to catalog', async () => {
    const driver = new NonZeroExitDriver();
    const res = await runBmadHelpDiscovery({
      ...defaultCtx,
      driver
    });

    expect(res.discoveredViaDriver).toBe(false);
    expect(res.recommendedSkills.length).toBeGreaterThan(0);
    expect(res.recommendedSkills[0].skillName).toBe('bmad-create-story');
  });

  it('handles driver returning non-zero exit code with skill in stderr', async () => {
    const driver = new NonZeroWithStderrSkillDriver();
    const res = await runBmadHelpDiscovery({
      ...defaultCtx,
      driver
    });

    // Output parsing catches skill in stderr via regex
    expect(res.recommendedSkills.length).toBeGreaterThan(0);
    expect(res.recommendedSkills[0].skillName).toBe('bmad-dev-story');
  });

  it('handles driver returning invalid JSON (HTML output) without crashing and falls back to catalog', async () => {
    const driver = new InvalidJsonDriver();
    const res = await runBmadHelpDiscovery({
      ...defaultCtx,
      driver
    });

    expect(res.discoveredViaDriver).toBe(false);
    expect(res.recommendedSkills.length).toBeGreaterThan(0);
    expect(res.recommendedSkills[0].skillName).toBe('bmad-create-story');
  });

  it('handles driver returning 0 skills ([]) without crashing and falls back to catalog', async () => {
    const driver = new ZeroSkillsDriver();
    const res = await runBmadHelpDiscovery({
      ...defaultCtx,
      driver
    });

    expect(res.discoveredViaDriver).toBe(false);
    expect(res.recommendedSkills.length).toBeGreaterThan(0);
    expect(res.recommendedSkills[0].skillName).toBe('bmad-create-story');
  });
});
