import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { StreamQueryParser, detectSubagentQuery } from '../src/session/stream-parser.js';
import { HeartbeatMonitor } from '../src/watchdog/heartbeat-monitor.js';
import {
  loadDeferredWork,
  resolveDeferredTask,
  markDeferredTasksResolved
} from '../src/sprint/deferred-work-resolver.js';

describe('Empirical Challenge - Stream Chunk Parser Stress Tests', () => {
  it('detects prompts split across chunk boundaries', () => {
    const parser = new StreamQueryParser();
    const chunk1 = parser.parseChunk('Are you sure you want to delete this file? [y/');
    expect(chunk1).toBeNull();

    const chunk2 = parser.parseChunk('N]');
    expect(chunk2).not.toBeNull();
    expect(chunk2?.isConfirmation).toBe(true);
    expect(chunk2?.rawPrompt).toContain('[y/N]');
  });

  it('handles buffer slicing when text exceeds 4096 chars', () => {
    const parser = new StreamQueryParser();
    // Generate 4000 chars of random log output
    const padding = 'X'.repeat(4000);
    parser.parseChunk(padding);

    // Feed prompt right after
    const result = parser.parseChunk('\nDo you want to proceed? [y/N]');
    expect(result).not.toBeNull();
  });

  it('VULNERABILITY: prompt truncated at 4096 buffer boundary slice', () => {
    const parser = new StreamQueryParser();
    // Fill buffer to 4090 chars
    const padding = 'A'.repeat(4090);
    parser.parseChunk(padding);

    // Feed chunk that pushes buffer > 4096.
    // The prompt "Do you want to continue? [y/N]" starts at char 4090.
    // When buffer > 4096, buffer.slice(-2048) cuts off index 0..2048, keeping 2048..4120.
    // Since the prompt started at 4090, it remains in the sliced buffer.
    // BUT what if the prompt started at index 2040 and ended at 2060?
    // Let's test slicing when buffer reaches 4097!
    const parser2 = new StreamQueryParser();
    const fill1 = 'B'.repeat(2045);
    parser2.parseChunk(fill1);
    // Buffer is now 2045. Now feed chunk starting with prompt prefix:
    const promptPrefix = 'Do you wish to continue? '; // 25 chars -> buffer = 2070
    parser2.parseChunk(promptPrefix);
    // Feed 2030 chars of data -> total 4100 chars (triggers slice(-2048))
    const fill2 = 'C'.repeat(2030);
    parser2.parseChunk(fill2); // buffer sliced to last 2048 chars! "Do you wish to..." was at start, so it got cut off!
    // Now feed suffix:
    const promptSuffix = '[y/N]';
    const res = parser2.parseChunk(promptSuffix);
    // "continue?" regex test: since "Do you wish to continue? " was cut off by slice(-2048),
    // only "C...C[y/N]" remains. /\[y\/N\]/ will still match, but rawPrompt is truncated!
    expect(res).not.toBeNull();
    expect(res?.rawPrompt).not.toContain('Do you wish to continue');
  });

  it('FIXED: buffer slice preservation retains trailing content in same chunk', () => {
    const parser = new StreamQueryParser();
    // A chunk containing a prompt followed by important logs and a second prompt
    const chunk = 'Prompt 1: confirm? [y/N]\nProcessing complete.\nPrompt 2: proceed? [y/N]';
    const result1 = parser.parseChunk(chunk);
    expect(result1).not.toBeNull();
    expect(result1?.rawPrompt).toContain('Prompt 1');

    // After result1 match, buffer retains trailing content!
    const result2 = parser.parseChunk('');
    expect(result2).not.toBeNull();
    expect(result2?.rawPrompt).toContain('Prompt 2');
  });

  it('FIXED: excludes code comments and string declarations containing prompt patterns', () => {
    const codeChunk = 'const msg = "Do you want to proceed?"; // confirm?';
    const result = detectSubagentQuery(codeChunk);
    expect(result).toBeNull(); // Code string/comment ignored!
  });

  it('ANSI ESCAPE CODES: handling formatted terminal output', () => {
    const ansiPrompt = '\u001b[32mDo you want to proceed?\u001b[0m \u001b[1m[y/N]\u001b[0m';
    const result = detectSubagentQuery(ansiPrompt);
    expect(result).not.toBeNull();

    // ANSI codes embedded INSIDE prompt brackets (e.g. colored y/N)
    const ansiEmbedded = 'Delete file? [\u001b[32my\u001b[0m/\u001b[31mN\u001b[0m]';
    const resultEmbedded = detectSubagentQuery(ansiEmbedded);
    expect(resultEmbedded).not.toBeNull();
  });
});

describe('Empirical Challenge - HeartbeatMonitor & Abort Watchdog Stress Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('FIXED: calling pulse() after stop() does not restart timer or trigger timeout', () => {
    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout,
      onActivity: () => {}
    });

    monitor.start();
    monitor.stop(); // Stopped!

    // Late stdout chunk fires pulse() after process stop
    monitor.pulse();

    // Advance time past timeoutMs
    vi.advanceTimersByTime(1500);

    // onTimeout is NOT called because monitor was stopped
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('handles rapid pulse calls without memory or timer leak', () => {
    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout,
      onActivity: () => {}
    });

    monitor.start();
    for (let i = 0; i < 100; i++) {
      monitor.pulse();
      vi.advanceTimersByTime(10);
    }

    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1100);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('multiple start() calls cleanly reset timeout', () => {
    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout,
      onActivity: () => {}
    });

    monitor.start();
    vi.advanceTimersByTime(800);
    monitor.start(); // Restart

    vi.advanceTimersByTime(800);
    expect(onTimeout).not.toHaveBeenCalled(); // Should not fire yet

    vi.advanceTimersByTime(300);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('Empirical Challenge - Deferred Work Resolver Stress Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-stress-deferred-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('FIXED: supports asterisk bullet points and uppercase [X] correctly', async () => {
    const deferredFile = path.join(tempDir, 'deferred-work.md');
    await fs.writeFile(
      deferredFile,
      '# Deferred Work\n* [ ] Task with asterisk\n- [X] Task with uppercase X\n- [ ] Normal task'
    );

    const items = await loadDeferredWork(tempDir);
    expect(items.some(i => i.includes('asterisk'))).toBe(true);
    expect(items.some(i => i.includes('uppercase X'))).toBe(false);
  });

  it('queries deferred tasks matching partial substrings in titles without disk mutation (read-only)', async () => {
    const deferredFile = path.join(tempDir, 'deferred-work.md');
    const initialContent = '# Deferred Work for Task 1\n- [ ] Task 1 - subtask A\n- [ ] Task 2';
    await fs.writeFile(deferredFile, initialContent);

    const success = await resolveDeferredTask(tempDir, 'Task 1');
    expect(success).toBe(true);

    const content = await fs.readFile(deferredFile, 'utf-8');
    // Read-only query helper does not mutate deferred-work.md on disk
    expect(content).toBe(initialContent);
  });

  it('handles missing deferred-work.md gracefully', async () => {
    const items = await loadDeferredWork(tempDir);
    expect(items).toEqual([]);

    const resolved = await resolveDeferredTask(tempDir, 'non-existent-task');
    expect(resolved).toBe(false);
  });
});
