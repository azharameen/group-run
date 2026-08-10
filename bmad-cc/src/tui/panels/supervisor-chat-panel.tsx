import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;
import { ChatInput } from '../chat-input.js';
import { THEME } from '../theme.js';
import { cleanAndSplitLines } from '../../utils/ansi-cleaner.js';

export interface ChatMessage {
  role: 'user' | 'supervisor';
  text: string;
  timestamp: string;
  eventType?: string;
}

export interface SupervisorChatPanelProps {
  messages: ChatMessage[];
  driverName: string;
  currentStoryKey: string | null;
  currentPhase: string;
  isExecuting: boolean;
  isFocused: boolean;
  panelHeight: number;
  cursorIndex: number;
  onSubmitDirective: (directive: string) => void;
}

export const SupervisorChatPanel: React.FC<SupervisorChatPanelProps> = ({
  messages,
  driverName,
  currentStoryKey,
  currentPhase,
  isExecuting,
  isFocused,
  panelHeight,
  cursorIndex,
  onSubmitDirective
}: SupervisorChatPanelProps) => {
  // Reserve: border(2) + header(2) + phase-bar(1) + divider(1) + chat-input(3) + margins(2) = ~11
  const chatViewportHeight = Math.max(4, panelHeight - 11);

  // Build flat lines from messages for viewport slicing
  const allLines: Array<{ role: 'user' | 'supervisor'; line: string; timestamp: string; eventType?: string }> = [];
  for (const msg of messages) {
    const lines = cleanAndSplitLines(msg.text).filter(Boolean);
    lines.forEach((line: string, i: number) => {
      allLines.push({
        role: msg.role,
        line,
        timestamp: i === 0 ? msg.timestamp : '',
        eventType: msg.eventType
      });
    });
  }

  const total = allLines.length;
  const clamped = Math.max(0, Math.min(cursorIndex, Math.max(0, total - 1)));
  // Always show tail (latest messages) — startIdx follows cursor
  const startIdx = Math.max(0, Math.min(clamped, Math.max(0, total - chatViewportHeight)));
  const visible = allLines.slice(startIdx, startIdx + chatViewportHeight);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? THEME.focusBorder : THEME.idleBorder}
      paddingX={1}
      paddingY={0}
      width="100%"
      height={panelHeight}
    >
      {/* Panel Header */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={isFocused ? THEME.heading : THEME.subheading}>
          {isFocused ? '❯ ' : '  '}Supervisor Console
        </Text>
        <Box gap={1}>
          {isExecuting && (
            <Text color={THEME.success}><Spinner type="dots" /></Text>
          )}
          <Text color={THEME.muted}>Driver:</Text>
          <Text bold color={THEME.accent}>[{driverName}]</Text>
        </Box>
      </Box>

      {/* Active Story Phase Bar */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderColor={THEME.idleBorder}
        paddingX={1}
        marginBottom={0}
      >
        <Text color="white" bold>
          {'Active: '}
          <Text color={THEME.accent}>
            {currentStoryKey
              ? (currentStoryKey.length > 20 ? currentStoryKey.slice(0, 18) + '..' : currentStoryKey)
              : 'None'}
          </Text>
        </Text>
        <Text color={THEME.phaseColor(currentPhase)} bold>
          {THEME.phaseLabel(currentPhase)}
        </Text>
      </Box>

      {/* Chat Thread Viewport */}
      <Box flexDirection="column" flexGrow={1} marginY={0}>
        {visible.length === 0 && (
          <Text color={THEME.muted} dimColor>
            {'  Supervisor online. Type a directive or press [r] to run.'}
          </Text>
        )}
        {visible.map((entry, idx) => {
          const isUser = entry.role === 'user';
          const lineColor = isUser
            ? THEME.userChat
            : entry.eventType === 'gate' ? THEME.success
            : entry.eventType === 'error' ? THEME.error
            : THEME.agentChat;

          if (isUser) {
            // Right-aligned user messages
            return (
              <Box key={idx} justifyContent="flex-end">
                <Text color={THEME.muted} dimColor>{entry.timestamp} </Text>
                <Text color={lineColor} bold>{'You: '}</Text>
                <Text color="white">{entry.line}</Text>
              </Box>
            );
          } else {
            // Left-aligned supervisor messages
            return (
              <Box key={idx} justifyContent="flex-start">
                <Text color={lineColor} bold>{'★ '}</Text>
                <Text color="white">{entry.line}</Text>
                {entry.timestamp ? <Text color={THEME.muted} dimColor>{' ' + entry.timestamp}</Text> : null}
              </Box>
            );
          }
        })}
      </Box>

      {/* Scroll hint */}
      {isFocused && total > chatViewportHeight && (
        <Text color={THEME.muted} dimColor>
          {'  [↑/↓] Scroll chat history'}
        </Text>
      )}

      {/* Chat Input */}
      <ChatInput
        isFocused={isFocused}
        onSubmit={onSubmitDirective}
      />
    </Box>
  );
};
