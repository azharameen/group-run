import { describe, it, expect } from 'vitest';
import Status from '../../src/commands/status.js';
import Doctor from '../../src/commands/doctor.js';
import History from '../../src/commands/history.js';
import Config from '../../src/commands/config.js';

describe('oclif Command Classes', () => {
  it('defines Status command description and flags', () => {
    expect(Status.description).toContain('Display sprint progress overview');
    expect(Status.flags.epic).toBeDefined();
    expect(Status.flags.status).toBeDefined();
    expect(Status.flags.json).toBeDefined();
  });

  it('defines Doctor command description', () => {
    expect(Doctor.description).toContain('Diagnose BMad environment');
  });

  it('defines History command description and flags', () => {
    expect(History.description).toContain('Show past session logs');
    expect(History.flags.json).toBeDefined();
  });

  it('defines Config command description and flags', () => {
    expect(Config.description).toContain('Display active configuration');
    expect(Config.flags.set).toBeDefined();
  });
});
