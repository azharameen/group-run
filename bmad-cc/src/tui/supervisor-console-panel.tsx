import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ChatInput } from './chat-input.js';

export interface SupervisorConsolePanelProps {
  currentStoryKey: string | null;
  currentPhase: string;
  driverName: string;
  agentOutput: string;
  isExecuting: boolean;
  isFocused: boolean;
  panelHeight?: number;
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
  onSubmitDirective
}) => {
  const maxLines = Math.max(4, panelHeight - 11);
  const outputLines = agentOutput.split('\n').filter(Boolean).slice(-maxLines);
  if (outputLines.length === 0) {
    outputLines.push('Supervisor Agent active. Type a directive below or press [r] to run sprint.');
  }

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
    <Box flexDirection="column" borderWidth={1} borderColor={isFocused ? 'cyan' : 'gray'} padding={1} width="100%" height={panelHeight}>
      {/* Console Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          {isFocused ? '❯ ' : '  '}Supervisor Agent Interactive Console
        </Text>
        <Text color="yellow">Driver: <Text bold color="white">{driverName}</Text></Text>
      </Box>

      {/* Active Story & Phase Bar */}
      <Box flexDirection="row" justifyContent="space-between" backgroundColor="gray" paddingX={1} marginBottom={1}>
        <Text color="white" bold wrap="truncate">
          Active Target: <Text color="yellow">{currentStoryKey ? (currentStoryKey.length > 22 ? currentStoryKey.substring(0, 20) + '..' : currentStoryKey) : 'None'}</Text>
        </Text>
        <Text>
          Phase: {getPhaseBadge(currentPhase)}
        </Text>
      </Box>

      {/* Live Supervisor Dialogue & Directive Stream */}
      <Box flexDirection="column" flexGrow={1} borderWidth={1} borderColor="gray" padding={1} marginBottom={1}>
        <Text bold color="green">Supervisor Log Stream:</Text>
        <Box flexDirection="column" marginTop={1}>
          {outputLines.map((line, idx) => (
            <Text key={idx} color="white" wrap="truncate">
              <Text color="gray">{`> `}</Text>
              {line}
            </Text>
          ))}
        </Box>
      </Box>

      {/* Interactive Supervisor Chat Input Box */}
      <ChatInput
        isFocused={isFocused}
        onSubmit={val => {
          if (onSubmitDirective) {
            onSubmitDirective(val);
          }
        }}
      />
    </Box>
  );
};
