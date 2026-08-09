import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { execa } from 'execa';
import { THEME } from '../theme.js';

export interface GitDiffModalProps {
  projectRoot: string;
  cursorIndex: number;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({
  projectRoot,
  cursorIndex
}) => {
  const { stdout } = useStdout();
  const termCols = stdout?.columns || 100;
  const termRows = stdout?.rows || 30;

  const [diffLines, setDiffLines] = useState<string[]>(['Loading git diff...']);
  const [hasChanges, setHasChanges] = useState<boolean>(true);

  useEffect(() => {
    execa('git', ['diff', 'HEAD'], { cwd: projectRoot, reject: false })
      .then(res => {
        const output = (res.stdout || '').trim();
        if (!output) {
          // If git diff HEAD is empty, try unstaged git diff
          return execa('git', ['diff'], { cwd: projectRoot, reject: false });
        }
        return res;
      })
      .then(res => {
        const output = (res?.stdout || '').trim();
        if (!output) {
          setHasChanges(false);
          setDiffLines(['No uncommitted working tree changes detected.']);
        } else {
          setHasChanges(true);
          setDiffLines(output.split('\n'));
        }
      })
      .catch(err => {
        setHasChanges(false);
        setDiffLines([`Could not fetch git diff: ${err.message}`]);
      });
  }, [projectRoot]);

  // Viewport calculation: reserve border(2) + header(2) + divider(2) + footer(2) = 8
  const viewportHeight = Math.max(5, termRows - 8);
  const total = diffLines.length;
  const clamped = Math.max(0, Math.min(cursorIndex, Math.max(0, total - 1)));
  const startIdx = Math.max(0, Math.min(clamped, Math.max(0, total - viewportHeight)));
  const visible = diffLines.slice(startIdx, startIdx + viewportHeight);

  const getLineColor = (line: string): 'green' | 'red' | 'cyan' | 'yellow' | 'white' => {
    if (line.startsWith('+') && !line.startsWith('+++')) return 'green';
    if (line.startsWith('-') && !line.startsWith('---')) return 'red';
    if (line.startsWith('diff --git') || line.startsWith('index ')) return 'cyan';
    if (line.startsWith('@@')) return 'yellow';
    if (line.startsWith('---') || line.startsWith('+++')) return 'cyan';
    return 'white';
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={THEME.focusBorder}
      paddingX={1}
      width={termCols - 2}
      height={termRows - 1}
    >
      {/* Modal Header */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={THEME.heading}>
          ══ LIVE GIT DIFF INSPECTOR ══
        </Text>
        <Text color={THEME.muted}>
          Working Directory: <Text color="white" bold>{projectRoot}</Text>
        </Text>
      </Box>

      <Text color={THEME.idleBorder}>{'─'.repeat(Math.max(10, termCols - 6))}</Text>

      {/* Diff Viewport */}
      <Box flexDirection="column" flexGrow={1}>
        {!hasChanges ? (
          <Box flexDirection="column" gap={1} marginTop={2} alignSelf="center">
            <Text bold color={THEME.success}>✔ Working tree clean</Text>
            <Text color={THEME.muted}>No modified or staged files currently in repository.</Text>
          </Box>
        ) : (
          visible.map((line: string, idx: number) => {
            const isCurrentLine = (startIdx + idx) === clamped;
            return (
              <Text
                key={startIdx + idx}
                color={getLineColor(line)}
                bold={isCurrentLine || line.startsWith('@@') || line.startsWith('diff')}
                wrap="truncate"
              >
                {isCurrentLine ? <Text color={THEME.accent}>❯ </Text> : '  '}
                {line || ' '}
              </Text>
            );
          })
        )}
      </Box>

      {/* Scroll indicator */}
      {hasChanges && (
        <Text color={THEME.muted} dimColor>
          {'  Lines ' + (startIdx + 1) + '–' + Math.min(startIdx + viewportHeight, total) + ' of ' + total}
        </Text>
      )}

      <Text color={THEME.idleBorder}>{'─'.repeat(Math.max(10, termCols - 6))}</Text>
      <Box justifyContent="center">
        <Text color={THEME.muted}>
          {'[↑/↓] Scroll  │  [g] / [Esc] Close Diff Inspector  │  [Ctrl+C] Quit'}
        </Text>
      </Box>
    </Box>
  );
};
