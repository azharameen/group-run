import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  parseCsvLine,
  parseBmadHelpCsv,
  loadBmadHelpCatalog,
  extractModuleMetaDocs
} from '../../src/supervisor/catalog-parser.js';

describe('catalog-parser', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-test-catalog-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parses CSV lines with quotes and commas cleanly', () => {
    const line = 'BMad Method,bmad-prd,Create Edit and Review PRD,PRD,"Facilitated PRD workflow — create, update, or validate.",create,,2-planning,bmad-product-brief,,true,planning_artifacts,prd';
    const fields = parseCsvLine(line);
    expect(fields[0]).toBe('BMad Method');
    expect(fields[1]).toBe('bmad-prd');
    expect(fields[4]).toBe('Facilitated PRD workflow — create, update, or validate.');
    expect(fields[10]).toBe('true');
  });

  it('parses full bmad-help.csv string content', () => {
    const csvContent = `module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs
BMad Builder,_meta,,,,,,,,,false,https://bmad-builder-docs.bmad-method.org/llms.txt,
BMad Method,bmad-create-story,Create Story,CS,Story cycle start,,,4-implementation,bmad-sprint-planning,bmad-dev-story,true,implementation_artifacts,story
BMad Method,bmad-dev-story,Dev Story,DS,Execute implementation,,,4-implementation,bmad-create-story,,true,,
`;
    const rows = parseBmadHelpCsv(csvContent);
    expect(rows.length).toBe(3);
    expect(rows[0].skill).toBe('_meta');
    expect(rows[1].skill).toBe('bmad-create-story');
    expect(rows[1].required).toBe(true);
    expect(rows[2].skill).toBe('bmad-dev-story');
  });

  it('extracts module metadata links (_meta rows)', () => {
    const csvContent = `module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs
BMad Builder,_meta,,,,,,,,,false,https://bmad-builder-docs.bmad-method.org/llms.txt,
Core,_meta,,,,,,,,,false,https://docs.bmad-method.org/llms.txt,
BMad Method,bmad-dev-story,Dev Story,DS,,,,4-implementation,,,true,,
`;
    const rows = parseBmadHelpCsv(csvContent);
    const meta = extractModuleMetaDocs(rows);
    expect(meta.length).toBe(2);
    expect(meta[0].docsUrlOrPath).toContain('bmad-builder-docs');
    expect(meta[1].docsUrlOrPath).toContain('docs.bmad-method.org');
  });

  it('loads bmad-help.csv from project root _bmad/_config/bmad-help.csv', async () => {
    const configDir = path.join(tempDir, '_bmad', '_config');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'bmad-help.csv'),
      'module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs\nBMad Method,bmad-code-review,Code Review,CR,Review code,,,4-implementation,bmad-dev-story,,false,,'
    );

    const catalog = await loadBmadHelpCatalog(tempDir);
    expect(catalog.length).toBe(1);
    expect(catalog[0].skill).toBe('bmad-code-review');
  });
});
