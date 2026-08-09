import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { atomicWriteFile, ensureDir } from '../utils/file-helpers.js';

export interface ConfigOptions {
  set?: string;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  const config = loadConfig();

  if (options.set) {
    const [key, value] = options.set.split('=');
    if (!key || value === undefined) {
      console.error(chalk.red('Error: Format must be --set key=value (e.g. --set agent.driver=gemini)'));
      return;
    }

    const stateDir = path.resolve(config.projectRoot, '.bmad-cc');
    await ensureDir(stateDir);
    const configJsonPath = path.resolve(stateDir, 'config.json');

    // Update nested key
    const parts = key.split('.');
    let current: any = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;

    await atomicWriteFile(configJsonPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`Updated configuration key '${key}' = '${value}'`));
    return;
  }

  console.log(chalk.cyan.bold('\n⚙️ BMad Command Center Configuration:\n'));
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}
