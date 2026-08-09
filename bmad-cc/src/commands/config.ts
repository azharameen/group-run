import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { atomicWriteFile, ensureDir } from '../utils/file-helpers.js';

export default class Config extends Command {
  static override description = 'Display active configuration or update specific settings key';

  static override flags = {
    set: Flags.string({ description: 'Update config value in key=value format (e.g. agent.driver=gemini)' })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Config);
    const config = loadConfig();

    if (flags.set) {
      const [key, value] = flags.set.split('=');
      if (!key || value === undefined) {
        this.error('Format must be --set key=value (e.g. --set agent.driver=gemini)');
      }

      const stateDir = path.resolve(config.projectRoot, '_bmad');
      await ensureDir(stateDir);
      const configJsonPath = path.resolve(stateDir, 'config.json');

      const parts = key.split('.');
      let current: any = config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;

      await atomicWriteFile(configJsonPath, JSON.stringify(config, null, 2));
      this.log(chalk.green(`Updated configuration key '${key}' = '${value}'`));
      return;
    }

    this.log(chalk.cyan.bold('\n⚙️ BMad Command Center Configuration:\n'));
    this.log(JSON.stringify(config, null, 2));
    this.log('');
  }
}
