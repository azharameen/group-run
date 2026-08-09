import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface SubSessionMonitorPanelProps {
  activeSkill?: string;
  activeSessionId?: string | null;
  driverName?: string;
  isExecuting: boolean;
  isFocused: boolean;
  panelHeight?: number;
  subSessionOutput?: string[];
}

export const SubSessionMonitorPanel: React.FC<SubSessionMonitorPanelProps> = ({
  activeSkill,
  activeSessionId,
  driverName = 'gemini',
  isExecuting,
  isFocused,
  panelHeight = 18,
  subSessionOutput = [
    'Sub-agent standing by.',
    'Transcripts saved to .bmad-cc/sessions/'
  ]
}) => {
  const maxLogs = Math.max(3, panelHeight - 12);
  const visibleLogs = subSessionOutput.slice(-maxLogs);

  return (
    <Box flexDirection="column" borderWidth={1} borderColor={isFocused ? 'cyan' : 'gray'} padding={1} width="100%" height={panelHeight}>
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
        <Box flexDirection="column" borderWidth={1} borderColor={activeSkill === 'bmad-dev-story' ? 'yellow' : 'gray'} paddingX={1}>
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
        <Box flexDirection="column" borderWidth={1} borderColor={activeSkill === 'bmad-code-review' ? 'cyan' : 'gray'} paddingX={1}>
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

      {/* Sub-Agent Real-time Execution Output Stream */}
      <Box flexDirection="column" flexGrow={1} borderWidth={1} borderColor="magenta" padding={1}>
        <Text bold color="magenta">Driver Event Stream & Transcript:</Text>
        <Box flexDirection="column" marginTop={1}>
          {visibleLogs.map((log, idx) => (
            <Text key={idx} color="white" wrap="truncate">
              <Text color="magenta">{`⚡ `}</Text>
              {log}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
