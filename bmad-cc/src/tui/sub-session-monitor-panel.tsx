import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;

export interface SubSessionMonitorPanelProps {
  activeSkill?: string;
  activeSessionId?: string | null;
  driverName?: string;
  isExecuting: boolean;
  isFocused: boolean;
  panelHeight?: number;
  subSessionOutput?: string[];
  cursorIndex?: number;
}

export const SubSessionMonitorPanel: React.FC<SubSessionMonitorPanelProps> = ({
  activeSkill,
  activeSessionId,
  driverName = 'gemini',
  isExecuting,
  isFocused,
  panelHeight = 18,
  subSessionOutput = [
    '[DRIVER READY] Standing by.',
    'Session transcripts logged to _bmad/sessions/'
  ],
  cursorIndex = 0
}: SubSessionMonitorPanelProps) => {
  // Flatten multi-line output into individual clean lines
  const allLines: string[] = [];
  for (const rawLog of subSessionOutput) {
    const split = rawLog.split('\n').map((l: string) => l.trimEnd()).filter(Boolean);
    allLines.push(...split);
  }

  const windowSize = Math.max(3, panelHeight - 13);
  const totalLogs = allLines.length;
  const clampedCursor = Math.max(0, Math.min(cursorIndex, totalLogs - 1));
  const startIdx = Math.max(0, Math.min(clampedCursor, Math.max(0, totalLogs - windowSize)));
  const visibleLogs = allLines.slice(startIdx, startIdx + windowSize);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={isFocused ? 'cyan' : 'gray'} padding={1} width="100%" height={panelHeight}>
      {/* Sub-Session Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          {isFocused ? '❯ ' : '  '}Sub-Sessions Monitor
        </Text>
        <Text color="magenta">BMad Agents</Text>
      </Box>

      {/* Active Session & Driver Badge */}
      <Box flexDirection="row" justifyContent="space-between" backgroundColor="gray" paddingX={1} marginBottom={1}>
        <Text color="white" bold wrap="truncate">
          Session: <Text color="yellow">{activeSessionId ? `sess_${activeSessionId.substring(0, 8)}` : 'Idle'}</Text>
        </Text>
        <Text color="cyan">{driverName}</Text>
      </Box>

      {/* Sub-Agent Skill Cards */}
      <Box flexDirection="column" gap={1} marginBottom={1}>
        {/* Session 1: Developer Sub-Agent */}
        <Box flexDirection="column" borderStyle="single" borderColor={activeSkill === 'bmad-dev-story' ? 'yellow' : 'gray'} paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold color="yellow">⚙️ bmad-dev-story</Text>
            <Text color={isExecuting && activeSkill !== 'bmad-code-review' ? 'green' : 'gray'}>
              {isExecuting && activeSkill !== 'bmad-code-review' ? (
                <Text color="green"><Spinner type="dots" /> RUNNING</Text>
              ) : (
                'STANDBY'
              )}
            </Text>
          </Box>
        </Box>

        {/* Session 2: Code Review Auditor */}
        <Box flexDirection="column" borderStyle="single" borderColor={activeSkill === 'bmad-code-review' ? 'cyan' : 'gray'} paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold color="cyan">⚙️ bmad-code-review</Text>
            <Text color={isExecuting && activeSkill === 'bmad-code-review' ? 'cyan' : 'gray'}>
              {isExecuting && activeSkill === 'bmad-code-review' ? (
                <Text color="cyan"><Spinner type="dots" /> REVIEWING</Text>
              ) : (
                'STANDBY'
              )}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Sub-Agent Real-time Execution Output & Driver Prompt Inspector */}
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="magenta" padding={1}>
        <Box justifyContent="space-between">
          <Text bold color="magenta">Driver Stream:</Text>
          {isFocused && <Text color="yellow" dimColor>[↑/↓ Scroll Logs]</Text>}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {visibleLogs.map((log: string, idx: number) => {
            const isDriverInit = log.startsWith('[DRIVER INIT]');
            const isPrompt = log.startsWith('[PROMPT LOG]');
            const isTest = log.startsWith('[TEST');
            const isGate = log.startsWith('[GATE');

            const formattedLog = log.length > 45 ? log.substring(0, 43) + '..' : log;

            return (
              <Box key={idx}>
                <Text
                  color={
                    isDriverInit ? 'cyan' : isPrompt ? 'yellow' : isTest ? 'magenta' : isGate ? 'green' : 'white'
                  }
                  wrap="truncate"
                >
                  <Text color="magenta">{`⚡ `}</Text>
                  {formattedLog}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
