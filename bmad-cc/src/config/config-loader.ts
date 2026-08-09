import path from 'node:path';
import fs from 'node:fs';
import { BmadCcConfig } from './config-schema.js';
import { DEFAULT_CONFIG } from './defaults.js';

/**
 * Deep merges two objects.
 */
function deepMerge(target: any, source: any): any {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Loads and validates configuration natively from `_bmad/bmad-config.yaml` or `_bmad/config.json`.
 * Automatically resolves relative paths against `projectRoot`.
 * 
 * @param projectRoot Optional project root to override default inference.
 * @returns BmadCcConfig parsed configuration.
 */
export function loadConfig(projectRoot?: string): BmadCcConfig {
  const root = projectRoot || DEFAULT_CONFIG.projectRoot;
  const bmadConfigPath = path.join(root, '_bmad', 'config.json');
  
  let config = { ...DEFAULT_CONFIG, projectRoot: root };
  
  if (fs.existsSync(bmadConfigPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(bmadConfigPath, 'utf8'));
      config = deepMerge(config, userConfig);
    } catch (err) {
      console.warn(`Failed to parse config at ${bmadConfigPath}, using native defaults.`);
    }
  }

  // Automatically resolve relative paths against projectRoot
  const resolveRelative = (p: string) => path.isAbsolute(p) ? p : path.resolve(root, p);

  config.paths = {
    sprintStatus: resolveRelative(config.paths.sprintStatus),
    storyLocation: resolveRelative(config.paths.storyLocation),
    epics: resolveRelative(config.paths.epics),
    prd: config.paths.prd ? resolveRelative(config.paths.prd) : undefined,
    architecture: config.paths.architecture ? resolveRelative(config.paths.architecture) : undefined,
    bmadSkills: config.paths.bmadSkills ? resolveRelative(config.paths.bmadSkills) : undefined,
    bmadConfig: config.paths.bmadConfig ? resolveRelative(config.paths.bmadConfig) : undefined,
  };
  
  if (!config.paths.sprintStatus) {
    throw new Error('Config validation failed: sprintStatus path is required.');
  }
  
  return config as BmadCcConfig;
}
