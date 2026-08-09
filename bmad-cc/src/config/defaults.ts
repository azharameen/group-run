import path from 'node:path';
import fs from 'node:fs';
import { BmadCcConfig } from './config-schema.js';

/**
 * Helper to find project root by looking for _bmad-output or _bmad directory upwards.
 * Returns process.cwd() as fallback.
 */
function findProjectRoot(): string {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;
  while (currentDir !== root) {
    if (fs.existsSync(path.join(currentDir, '_bmad-output')) || fs.existsSync(path.join(currentDir, '_bmad'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return process.cwd();
}

/**
 * Default configuration for bmad-cc - Native BMad Architecture.
 */
export const DEFAULT_CONFIG: BmadCcConfig = {
  projectRoot: findProjectRoot(),
  paths: {
    sprintStatus: '_bmad-output/implementation-artifacts/sprint-status.yaml',
    storyLocation: '_bmad-output/implementation-artifacts',
    epics: '_bmad-output/planning-artifacts/epics.md',
    bmadConfig: '_bmad/bmad-config.yaml',
    bmadSkills: '.agent/skills'
  },
  agent: {
    driver: 'gemini',
    drivers: {
      gemini: { command: 'gemini', args: [] },
      antigravity: { command: 'antigravity', args: [] },
      opencode: { command: 'opencode', args: [] },
      copilot: { command: 'copilot', args: [] },
      custom: { command: 'custom', args: [] },
    }
  },
  limits: {
    maxRetries: 3,
    watchdogTimeoutSeconds: 120,
    sessionTimeoutMinutes: 90
  },
  verification: {
    commands: ['pytest backend/tests -q', 'cd frontend && npx vitest run']
  },
  notifications: {
    desktopNotify: false,
    audioAlert: false
  }
};
