import fs from 'fs/promises';
import path from 'path';
import { fileExists } from '../utils/file-helpers.js';

export interface BmadHelpCatalogRow {
  module: string;
  skill: string;
  displayName: string;
  menuCode: string;
  description: string;
  action: string;
  args: string;
  phase: string;
  precededBy: string;
  followedBy: string;
  required: boolean;
  outputLocation: string;
  outputs: string;
}

export interface BmadModuleMeta {
  module: string;
  docsUrlOrPath: string;
}

/**
 * Parses CSV lines handling quotes and escaped quotes cleanly.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Splits CSV content into lines, taking care not to split newlines inside quoted strings.
 */
export function splitCsvLines(csvContent: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    if (char === '"') {
      if (inQuotes && csvContent[i + 1] === '"') {
        currentLine += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && csvContent[i + 1] === '\n') {
        i++;
      }
      if (currentLine.trim().length > 0) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Parses full `bmad-help.csv` string content into BmadHelpCatalogRow records.
 */
export function parseBmadHelpCsv(csvContent: string): BmadHelpCatalogRow[] {
  if (!csvContent || typeof csvContent !== 'string') return [];

  const lines = splitCsvLines(csvContent);
  if (lines.length === 0) return [];

  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
      const firstFields = parseCsvLine(trimmed);
      const isHeader =
        firstFields.length >= 2 &&
        firstFields[0].toLowerCase() === 'module' &&
        firstFields[1].toLowerCase() === 'skill';
      if (isHeader) {
        startIdx = i + 1;
      } else {
        startIdx = i;
      }
      break;
    }
  }

  const rows: BmadHelpCatalogRow[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    const fields = parseCsvLine(trimmed);
    if (!fields || fields.length < 2) continue;

    if (fields.every(f => f.trim() === '')) continue;

    const [
      module = '',
      skill = '',
      displayName = '',
      menuCode = '',
      description = '',
      action = '',
      args = '',
      phase = '',
      precededBy = '',
      followedBy = '',
      requiredStr = 'false',
      outputLocation = '',
      outputs = ''
    ] = fields;

    if (!module.trim() && !skill.trim()) continue;

    rows.push({
      module: module.trim(),
      skill: skill.trim(),
      displayName: displayName.trim(),
      menuCode: menuCode.trim(),
      description: description.trim(),
      action: action.trim(),
      args: args.trim(),
      phase: phase.trim(),
      precededBy: precededBy.trim(),
      followedBy: followedBy.trim(),
      required: requiredStr.trim().toLowerCase() === 'true',
      outputLocation: outputLocation.trim(),
      outputs: outputs.trim()
    });
  }

  return rows;
}

/**
 * Loads `bmad-help.csv` from project root (`_bmad/_config/bmad-help.csv`).
 */
export async function loadBmadHelpCatalog(projectRoot: string): Promise<BmadHelpCatalogRow[]> {
  const csvPath = path.join(projectRoot, '_bmad', '_config', 'bmad-help.csv');
  if (!(await fileExists(csvPath))) {
    return [];
  }

  try {
    const content = await fs.readFile(csvPath, 'utf8');
    return parseBmadHelpCsv(content);
  } catch {
    return [];
  }
}

/**
 * Extracts metadata links (_meta rows) mapping modules to documentation (e.g. llms.txt).
 */
export function extractModuleMetaDocs(rows: BmadHelpCatalogRow[]): BmadModuleMeta[] {
  return rows
    .filter(row => row.skill === '_meta' && row.outputLocation)
    .map(row => ({
      module: row.module,
      docsUrlOrPath: row.outputLocation
    }));
}
