import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { scanBmadVersion } from './bmad-version-scanner.js';
import { validateSprintStatus } from './schema-validator.js';

const execAsync = promisify(exec);

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  detail?: string;
}

export interface CompatibilityReport {
  timestamp: string;
  projectRoot: string;
  checks: DiagnosticCheck[];
  overallStatus: 'healthy' | 'degraded' | 'broken';
}

async function checkCommand(cmd: string, args: string = '--version'): Promise<boolean> {
  try {
    await execAsync(`${cmd} ${args}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a comprehensive diagnostic compatibility report.
 * 
 * @param projectRoot The root directory of the project.
 * @returns A promise resolving to the CompatibilityReport.
 */
export async function generateReport(projectRoot: string): Promise<CompatibilityReport> {
  const checks: DiagnosticCheck[] = [];
  
  // 1. Node Version
  const nodeVersion = process.version;
  const isNode20 = parseInt(nodeVersion.slice(1).split('.')[0], 10) >= 20;
  checks.push({
    name: 'Node Version',
    status: isNode20 ? 'pass' : 'fail',
    message: isNode20 ? `Node.js ${nodeVersion} is compatible` : `Node.js >= 20 required (found ${nodeVersion})`
  });

  // 2. Project Root
  const bmadOutputDir = path.join(projectRoot, '_bmad-output');
  try {
    await fs.access(bmadOutputDir);
    checks.push({
      name: 'Project Output Directory',
      status: 'pass',
      message: '_bmad-output/ exists'
    });
  } catch {
    checks.push({
      name: 'Project Output Directory',
      status: 'fail',
      message: '_bmad-output/ not found'
    });
  }

  // 3. BMad Installation
  const bmadVersion = await scanBmadVersion(projectRoot);
  checks.push({
    name: 'BMad Installation',
    status: bmadVersion.configExists && bmadVersion.skillCount > 0 ? 'pass' : 'fail',
    message: bmadVersion.configExists ? `Found config v${bmadVersion.configVersion || 'unknown'} and ${bmadVersion.skillCount} skills` : 'Missing _bmad/ or .agent/skills/ directories'
  });

  // 4. Sprint Status File
  const sprintStatusPath = path.join(bmadOutputDir, 'implementation-artifacts', 'sprint-status.yaml');
  const sprintStatusResult = await validateSprintStatus(sprintStatusPath);
  checks.push({
    name: 'Sprint Status File',
    status: sprintStatusResult.valid ? 'pass' : 'fail',
    message: sprintStatusResult.valid ? 'sprint-status.yaml is valid' : 'sprint-status.yaml is missing or invalid',
    detail: sprintStatusResult.errors.join(', ') || undefined
  });

  // 5. Config File
  const configPath = path.join(projectRoot, '.bmad-cc', 'config.json');
  try {
    await fs.access(configPath);
    checks.push({
      name: 'Config File',
      status: 'pass',
      message: '.bmad-cc/config.json exists'
    });
  } catch {
    checks.push({
      name: 'Config File',
      status: 'warn',
      message: '.bmad-cc/config.json missing, using defaults'
    });
  }

  // 6. Agent Drivers
  const drivers = ['agy', 'gemini', 'opencode', 'gh'];
  const foundDrivers = [];
  for (const driver of drivers) {
    if (await checkCommand(driver, '--help')) {
      foundDrivers.push(driver);
    }
  }
  checks.push({
    name: 'Agent Drivers',
    status: foundDrivers.length > 0 ? 'pass' : 'warn',
    message: foundDrivers.length > 0 ? `Found: ${foundDrivers.join(', ')}` : 'No known agent CLI tools found on PATH'
  });

  // 7. Git Repository
  try {
    await fs.access(path.join(projectRoot, '.git'));
    checks.push({
      name: 'Git Repository',
      status: 'pass',
      message: 'Project is a git repository'
    });
  } catch {
    checks.push({
      name: 'Git Repository',
      status: 'warn',
      message: 'Project is not a git repository'
    });
  }

  // 8. Backend Tests
  const hasPytest = await checkCommand('pytest');
  checks.push({
    name: 'Backend Tests',
    status: hasPytest ? 'pass' : 'warn',
    message: hasPytest ? 'pytest is available' : 'pytest not found on PATH'
  });

  // 9. Frontend Tests
  const frontendDir = path.join(projectRoot, 'frontend');
  let hasVitest = false;
  try {
    const { stdout } = await execAsync('npx vitest --version', { cwd: frontendDir });
    hasVitest = stdout.includes('vitest');
  } catch {
    // Ignore error
  }
  checks.push({
    name: 'Frontend Tests',
    status: hasVitest ? 'pass' : 'warn',
    message: hasVitest ? 'vitest is available in frontend/' : 'vitest not found in frontend/'
  });

  // Determine overall status
  const hasFail = checks.some(c => c.status === 'fail');
  const hasWarn = checks.some(c => c.status === 'warn');
  
  let overallStatus: CompatibilityReport['overallStatus'] = 'healthy';
  if (hasFail) {
    overallStatus = 'broken';
  } else if (hasWarn) {
    overallStatus = 'degraded';
  }

  return {
    timestamp: new Date().toISOString(),
    projectRoot,
    checks,
    overallStatus
  };
}
