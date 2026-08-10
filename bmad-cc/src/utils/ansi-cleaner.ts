/**
 * Utility to clean ANSI escape codes from output strings prior to line splitting and string slicing.
 */
export function stripAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/[\u001b\u009b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\x1b\][0-9];.*?\x07/g, '');
}

export function cleanAndSplitLines(str: string): string[] {
  const cleaned = stripAnsi(str);
  return cleaned.split(/\r?\n/);
}

