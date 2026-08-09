import { AgentDriver } from './driver-interface.js';
import { AntigravityDriver } from './antigravity-driver.js';
import { GeminiDriver } from './gemini-driver.js';
import { OpenCodeDriver } from './opencode-driver.js';
import { CopilotDriver } from './copilot-driver.js';
import { CustomDriver } from './custom-driver.js';

export type DriverName = 'antigravity' | 'gemini' | 'opencode' | 'copilot' | 'custom';

export function createDriver(name: DriverName, config?: { command?: string; args?: string[] }): AgentDriver {
  switch (name) {
    case 'antigravity':
      return new AntigravityDriver();
    case 'gemini':
      return new GeminiDriver();
    case 'opencode':
      return new OpenCodeDriver();
    case 'copilot':
      return new CopilotDriver();
    case 'custom':
      if (!config?.command) {
        throw new Error('Custom driver requires a command');
      }
      return new CustomDriver(config.command, config.args || []);
    default:
      throw new Error(`Unknown driver name: ${name}`);
  }
}

export async function getAvailableDrivers(): Promise<DriverName[]> {
  const drivers: DriverName[] = ['antigravity', 'gemini', 'opencode', 'copilot'];
  const available: DriverName[] = [];
  
  for (const name of drivers) {
    const driver = createDriver(name);
    if (await driver.isAvailable()) {
      available.push(name);
    }
  }
  
  return available;
}
