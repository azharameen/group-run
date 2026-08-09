import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { THEME } from '../theme.js';

export interface LogInspectorModalProps {
  fullLog: string;
  sessionId?: string;
  skillName?: string;
  phase?: string;
  cursorIndex: number;
}

export const LogInspectorModal: React.FC<LogInspectorModalProps> = ({
  fullLog,
  sessionId,
  skillName,
  phase,
  cursorIndex
}) => {
  const { stdout } = useStdout();
  const termCols = stdout?.columns || 100;
  const termRows = stdout?.rows || 30;

  // Full content: split on newlines
  const allLines = fullLog.split('\n');
  const viewportHeight = Math.max(5, termRows - 6); // border(2) + header(2) + footer(2)
  const total = allLines.length;
  const clamped = Math.max(0, Math.min(cursorIndex, Math.max(0, total - 1)));
  const startIdx = Math.max(0, Math.min(clamped, Math.max(0, total - viewportHeight)));
  const visible = allLines.slice(startIdx, startIdx + viewportHeight);

  const sessionLabel = sessionId ? `sess_${sessionId.slice(0, 8)}` : '—';
  const skillLabel = skillName ?? '—';
  const phaseLabel = phase ?? '—';

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={THEME.accent}
      paddingX={1}
      width={termCols - 2}
      height={termRows - 1}
    >
      {/* Modal Header */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={THEME.accent}>
          ══ LOG INSPECTOR ══
        </Text>
        <Box gap={1}>
          <Text color={THEME.muted}>Session:</Text>
          <Text color={THEME.focusBorder} bold>{sessionLabel}</Text>
          <Text color={THEME.muted}>│ Skill:</Text>
          <Text color={THEME.highlight} bold>{skillLabel}</Text>
          <Text color={THEME.muted}>│ Phase:</Text>
          <Text color={THEME.accent} bold>{phaseLabel}</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Text color={THEME.idleBorder}>{'─'.repeat(Math.max(10, termCols - 6))}</Text>

      {/* Full content viewport */}
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, idx) => {
          const lineColor = THEME.logLineColor(line);
          const isCurrentLine = (startIdx + idx) === clamped;
          return (
            <Text
              key={startIdx + idx}
              color={lineColor}
              bold={isCurrentLine}
              wrap="wrap"
            >
              {isCurrentLine ? <Text color={THEME.accent}>❯ </Text> : '  '}
              {line || ' '}
            </Text>
          );
        })}
      </Box>

      {/* Scroll position indicator */}
      <Text color={THEME.muted} dimColor>
        {'  Lines ' + (startIdx + 1) + '–' + Math.min(startIdx + viewportHeight, total) + ' of ' + total}
      </Text>

      {/* Footer */}
      <Text color={THEME.idleBorder}>{'─'.repeat(Math.max(10, termCols - 6))}</Text>
      <Box justifyContent="center">
        <Text color={THEME.muted}>
          {'[↑/↓] Scroll  │  [Esc] Close Inspector  │  [Ctrl+C] Quit'}
        </Text>
      </Box>
    </Box>
  );
};
