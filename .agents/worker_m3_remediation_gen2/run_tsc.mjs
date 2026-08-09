import { execSync } from 'child_process';
import fs from 'fs';

try {
  const out = execSync('npx tsc --noEmit', { cwd: 'd:/Projects/POC/ideator/bmad-cc', encoding: 'utf8' });
  fs.writeFileSync('d:/Projects/POC/ideator/.agents/worker_m3_remediation_gen2/tsc_result.txt', 'SUCCESS:\n' + out);
} catch (err) {
  const stdout = err.stdout ? err.stdout.toString() : '';
  const stderr = err.stderr ? err.stderr.toString() : '';
  fs.writeFileSync('d:/Projects/POC/ideator/.agents/worker_m3_remediation_gen2/tsc_result.txt', 'FAILED:\n' + err.message + '\nSTDOUT:\n' + stdout + '\nSTDERR:\n' + stderr);
}
