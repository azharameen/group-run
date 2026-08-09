import { describe, it, expect } from 'vitest';
import { createDriver } from '../../src/agent/driver-factory.js';
import { AntigravityDriver } from '../../src/agent/antigravity-driver.js';
import { GeminiDriver } from '../../src/agent/gemini-driver.js';
import { OpenCodeDriver } from '../../src/agent/opencode-driver.js';
import { CopilotDriver } from '../../src/agent/copilot-driver.js';
import { CustomDriver } from '../../src/agent/custom-driver.js';

describe('Driver Factory', () => {
  it('creates an Antigravity driver', () => {
    const driver = createDriver('antigravity');
    expect(driver).toBeInstanceOf(AntigravityDriver);
    expect(driver.name).toBe('antigravity');
  });

  it('creates a Gemini driver', () => {
    const driver = createDriver('gemini');
    expect(driver).toBeInstanceOf(GeminiDriver);
    expect(driver.name).toBe('gemini');
  });

  it('creates an OpenCode driver', () => {
    const driver = createDriver('opencode');
    expect(driver).toBeInstanceOf(OpenCodeDriver);
    expect(driver.name).toBe('opencode');
  });

  it('creates a Copilot driver', () => {
    const driver = createDriver('copilot');
    expect(driver).toBeInstanceOf(CopilotDriver);
    expect(driver.name).toBe('copilot');
  });

  it('creates a Custom driver with valid config', () => {
    const driver = createDriver('custom', { command: 'mycli', args: ['run'] });
    expect(driver).toBeInstanceOf(CustomDriver);
    expect(driver.name).toBe('custom');
    expect(driver.getCommand()).toBe('mycli');
  });

  it('throws when creating Custom driver without command', () => {
    expect(() => createDriver('custom')).toThrow('Custom driver requires a command');
  });

  it('throws on unknown driver name', () => {
    // @ts-expect-error Testing invalid input
    expect(() => createDriver('unknown')).toThrow('Unknown driver name: unknown');
  });
});
