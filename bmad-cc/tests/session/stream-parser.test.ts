import { describe, it, expect } from 'vitest';
import { StreamQueryParser, detectSubagentQuery } from '../../src/session/stream-parser.js';

describe('StreamQueryParser & detectSubagentQuery', () => {
  it('detects standard confirmation prompts [y/N]', () => {
    const query = detectSubagentQuery('Do you want to apply these changes? [y/N]');
    expect(query).not.toBeNull();
    expect(query?.isConfirmation).toBe(true);
    expect(query?.defaultResponse).toBe('y');
  });

  it('detects Continue? prompt across streaming chunks', () => {
    const parser = new StreamQueryParser();
    const chunk1 = parser.parseChunk('Processing files... ');
    expect(chunk1).toBeNull();

    const chunk2 = parser.parseChunk('Do you wish to continue? (y/n)');
    expect(chunk2).not.toBeNull();
    expect(chunk2?.rawPrompt).toContain('continue?');
  });

  it('detects overwrite and proceed prompts', () => {
    expect(detectSubagentQuery('Overwrite existing file? [Y/n]')).not.toBeNull();
    expect(detectSubagentQuery('Do you want to proceed?')).not.toBeNull();
    expect(detectSubagentQuery('Are you sure?')).not.toBeNull();
  });

  it('returns null for normal log output', () => {
    expect(detectSubagentQuery('Building project target ESM dist/index.js')).toBeNull();
    expect(detectSubagentQuery('Executed 12 unit tests successfully.')).toBeNull();
  });
});
