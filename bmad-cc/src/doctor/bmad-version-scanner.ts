import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * Information about the BMad installation in the workspace.
 */
export interface BmadVersionInfo {
  configExists: boolean;
  configVersion: string | null;
  installedModules: string[];
  skillCount: number;
  hasManifest: boolean;
  manifestVersion: string | null;
}

/**
 * Scans the BMad directories to gather version and module information.
 * 
 * @param projectRoot The root directory of the project.
 * @returns A promise resolving to the BmadVersionInfo.
 */
export async function scanBmadVersion(projectRoot: string): Promise<BmadVersionInfo> {
  const bmadDir = path.join(projectRoot, '_bmad');
  const skillsDir = path.join(projectRoot, '.agent', 'skills');

  const info: BmadVersionInfo = {
    configExists: false,
    configVersion: null,
    installedModules: [],
    skillCount: 0,
    hasManifest: false,
    manifestVersion: null,
  };

  // Check config.toml
  const configPath = path.join(bmadDir, 'config.toml');
  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    info.configExists = true;
    const versionMatch = configContent.match(/version\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch) {
      info.configVersion = versionMatch[1];
    }
  } catch (err) {
    // Config doesn't exist or isn't readable
  }

  // Check manifest.yaml
  const manifestPath = path.join(bmadDir, '_config', 'manifest.yaml');
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    info.hasManifest = true;
    const versionMatch = manifestContent.match(/version:\s*(.+)/);
    if (versionMatch) {
      info.manifestVersion = versionMatch[1].trim();
    }
  } catch (err) {
    // Manifest doesn't exist
  }

  // Scan installed modules in _bmad/
  try {
    const bmadEntries = await fs.readdir(bmadDir, { withFileTypes: true });
    for (const entry of bmadEntries) {
      if (entry.isDirectory() && entry.name !== '_config') {
        info.installedModules.push(entry.name);
      }
    }
  } catch (err) {
    // _bmad directory doesn't exist
  }

  // Count skills in .agent/skills/
  try {
    const skillsEntries = await fs.readdir(skillsDir, { withFileTypes: true });
    info.skillCount = skillsEntries.filter(entry => entry.isDirectory()).length;
  } catch (err) {
    // Skills directory doesn't exist
  }

  return info;
}
