import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;
import { THEME } from '../theme.js';

export interface SessionEntry {
  sessionId: string;
  storyKey: string;
  driverName: string;
  skill: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  logs: string[];  // Raw full log lines (untruncated)
}

export interface SubSessionPanelProps {
  sessions: SessionEntry[];
  selectedSessionIndex: number;
  activeSkill: string | undefined;
  isExecuting: boolean;
  isFocused: boolean;
  panelHeight: number;
  logCursorIndex: number;
  onInspectLog: (fullLog: string) => void;
}

export const SubSessionPanel: React.FC<SubSessionPanelProps> = ({
  sessions,
  selectedSessionIndex,
  activeSkill,
  isExecuting,
  isFocused,
  panelHeight,
  logCursorIndex,
  onInspectLog
}: SubSessionPanelProps) => {
  // Layout: header(2) + session list (max 4 rows) + divider(1) + stream header(1) + stream logs + footer(1) = reserve ~10
  const sessionListHeight = Math.min(4, sessions.length + 1);
  const streamViewportHeight = Math.max(3, panelHeight - sessionListHeight - 8);

  const selectedSession = sessions[selectedSessionIndex] ?? null;
  const allStreamLines: string[] = selectedSession?.logs ?? [
    '[DRIVER READY] Standing by for session.',
    `Session transcripts logged to _bmad/sessions/`
  ];

  const totalLogs = allStreamLines.length;
  const clamped = Math.max(0, Math.min(logCursorIndex, Math.max(0, totalLogs - 1)));
  const startIdx = Math.max(0, Math.min(clamped, Math.max(0, totalLogs - streamViewportHeight)));
  const visibleLogs = allStreamLines.slice(startIdx, startIdx + streamViewportHeight);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? THEME.monitorBorder : THEME.idleBorder}
      paddingX={1}
      paddingY={0}
      width="100%"
      height={panelHeight}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={isFocused ? THEME.highlight : THEME.subheading}>
          {isFocused ? '❯ ' : '  '}Sub-Sessions
        </Text>
        <Text color={THEME.highlight}>BMad Agents</Text>
      </Box>

      {/* Session List */}
      <Box flexDirection="column" borderStyle="single" borderColor={THEME.idleBorder} paddingX={1}>
        {sessions.length === 0 ? (
          <Text color={THEME.muted} dimColor>No sessions yet.</Text>
        ) : (
          sessions.slice(0, 4).map((sess: SessionEntry, i: number) => {
            const isSelected = i === selectedSessionIndex;
            const statusIcon = sess.status === 'running'
              ? <Text color={THEME.success}><Spinner type="dots" /></Text>
              : sess.status === 'completed'
              ? <Text color={THEME.success}>✔</Text>
              : <Text color={THEME.error}>✗</Text>;

            return (
              <Box key={sess.sessionId} justifyContent="space-between">
                <Text
                  color={isSelected ? THEME.accent : THEME.subheading}
                  bold={isSelected}
                >
                  {isSelected ? '❯ ' : '  '}
                  sess_{sess.sessionId.slice(0, 6)}
                </Text>
                <Box gap={1}>
                  <Text color={THEME.muted}>[{sess.driverName}]</Text>
                  {statusIcon}
                </Box>
              </Box>
            );
          })
        )}
        {sessions.length > 4 && (
          <Text color={THEME.muted} dimColor>+{sessions.length - 4} more sessions</Text>
        )}
      </Box>

      {/* Active Skill Badges */}
      <Box flexDirection="row" gap={1} marginTop={0}>
        <Box
          borderStyle="single"
          borderColor={activeSkill === 'bmad-dev-story' ? THEME.accent : THEME.idleBorder}
          paddingX={1}
          flexGrow={1}
        >
          <Text bold color={activeSkill === 'bmad-dev-story' ? THEME.accent : THEME.muted}>
            {isExecuting && activeSkill === 'bmad-dev-story'
              ? <><Spinner type="dots" /> dev</>
              : '○ dev'}
          </Text>
        </Box>
        <Box
          borderStyle="single"
          borderColor={activeSkill === 'bmad-code-review' ? THEME.focusBorder : THEME.idleBorder}
          paddingX={1}
          flexGrow={1}
        >
          <Text bold color={activeSkill === 'bmad-code-review' ? THEME.focusBorder : THEME.muted}>
            {isExecuting && activeSkill === 'bmad-code-review'
              ? <><Spinner type="dots" /> review</>
              : '○ review'}
          </Text>
        </Box>
      </Box>

      {/* Live Driver Stream */}
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={THEME.monitorBorder} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color={THEME.highlight}>
            Driver Stream: <Text color={THEME.muted}>{selectedSession?.driverName ?? '–'}</Text>
          </Text>
          {isFocused && <Text color={THEME.muted} dimColor>[↑/↓] [v] Inspect</Text>}
        </Box>
        <Box flexDirection="column">
          {visibleLogs.map((log: string, idx: number) => {
            const lineColor = THEME.logLineColor(log);
            const displayLog = log.length > 38 ? log.slice(0, 36) + '..' : log;
            const isCurrentLine = (startIdx + idx) === clamped && isFocused;

            return (
              <Box key={idx}>
                <Text
                  color={lineColor}
                  bold={isCurrentLine}
                  wrap="truncate"
                >
                  <Text color={isCurrentLine ? THEME.accent : THEME.highlight}>
                    {isCurrentLine ? '❯ ' : '⚡ '}
                  </Text>
                  {displayLog}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Footer: scroll + inspect hint */}
      {isFocused && (
        <Text color={THEME.muted} dimColor>
          {'  [↑/↓] Scroll  [v/Enter] Full Log  [Tab] Switch Pane'}
        </Text>
      )}
    </Box>
  );
};
