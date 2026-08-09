import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;
import { ChatInput } from './chat-input.js';

export interface SupervisorConsolePanelProps {
  currentStoryKey: string | null;
  currentPhase: string;
  driverName: string;
  agentOutput: string;
  isExecuting: boolean;
  isFocused: boolean;
  panelHeight?: number;
  cursorIndex?: number;
  onSubmitDirective?: (directive: string) => void;
}

export const SupervisorConsolePanel: React.FC<SupervisorConsolePanelProps> = ({
  currentStoryKey,
  currentPhase,
  driverName,
  agentOutput,
  isExecuting,
  isFocused,
  panelHeight = 18,
  cursorIndex = 0,
  onSubmitDirective
}: SupervisorConsolePanelProps) => {
  // Flatten all newlines into single lines so multi-line stack traces never overflow box height
  const allLines = agentOutput.split('\n').map((l: string) => l.trimEnd()).filter(Boolean);
  if (allLines.length === 0) {
    allLines.push('Supervisor Agent active. Type a directive below or press [r] to run sprint.');
  }

  const maxVisibleLines = Math.max(3, panelHeight - 12);
  const totalLines = allLines.length;
  const clampedCursor = Math.max(0, Math.min(cursorIndex, totalLines - 1));
  const startIdx = Math.max(0, Math.min(clampedCursor, Math.max(0, totalLines - maxVisibleLines)));
  const visibleLines = allLines.slice(startIdx, startIdx + maxVisibleLines);

  const getPhaseBadge = (phase: string) => {
    switch (phase) {
      case 'develop':
        return <Text color="yellow">⚡ DEVELOPMENT</Text>;
      case 'review':
        return <Text color="cyan">🔍 CODE REVIEW</Text>;
      case 'gate':
        return <Text color="magenta">🚦 GATE DECISION</Text>;
      case 'done':
        return <Text color="green">✔ COMPLETE</Text>;
      default:
        return <Text color="gray">💤 IDLE</Text>;
    }
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={isFocused ? 'cyan' : 'gray'} padding={1} width="100%" height={panelHeight}>
      {/* Console Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          {isFocused ? '❯ ' : '  '}Supervisor Console
        </Text>
        <Text color="yellow">Driver: <Text bold color="white">{driverName}</Text></Text>
      </Box>

      {/* Active Story & Phase Bar */}
      <Box flexDirection="row" justifyContent="space-between" backgroundColor="gray" paddingX={1} marginBottom={1}>
        <Text color="white" bold wrap="truncate">
          Active: <Text color="yellow">{currentStoryKey ? (currentStoryKey.length > 22 ? currentStoryKey.substring(0, 20) + '..' : currentStoryKey) : 'None'}</Text>
        </Text>
        <Text>
          Phase: {getPhaseBadge(currentPhase)}
        </Text>
      </Box>

      {/* Live Supervisor Log Stream */}
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" padding={1} marginBottom={1}>
        <Box justifyContent="space-between">
          <Text bold color="green">Supervisor Log Stream:</Text>
          {isFocused && <Text color="yellow" dimColor>[↑/↓ Scroll Logs]</Text>}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {visibleLines.map((line: string, idx: number) => (
            <Text key={idx} color="white" wrap="truncate">
              <Text color="gray">{`> `}</Text>
              {line.length > 60 ? line.substring(0, 58) + '..' : line}
            </Text>
          ))}
        </Box>
      </Box>

      {/* Interactive Supervisor Chat Input Box */}
      <ChatInput
        isFocused={isFocused}
        onSubmit={(val: string) => {
          if (onSubmitDirective) {
            onSubmitDirective(val);
          }
        }}
      />
    </Box>
  );
};
