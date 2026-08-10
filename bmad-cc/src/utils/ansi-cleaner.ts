/**
 * Utility to clean ANSI escape codes from output strings prior to line splitting and string slicing.
 */
export function stripAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/(?:\x1b\]|\x9d|[\x1b\x9b]\])[\s\S]*?(?:\x07|\x1b\\|\x9c|\x1b\x07)/g, '')
    .replace(/(?:\x1b\[|\x9b)[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g, '')
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[\x07\x1b\x9c\x9d]/g, '');
}

export function cleanAndSplitLines(str: string): string[] {
  const cleaned = stripAnsi(str);
  return cleaned.split(/\r?\n/);
}


