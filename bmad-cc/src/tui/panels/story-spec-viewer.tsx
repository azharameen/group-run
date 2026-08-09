import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import fs from 'node:fs/promises';
import { THEME } from '../theme.js';

export interface StorySpecViewerProps {
  storyKey: string;
  storyFilePath: string | null;
  storyStatus: string;
  isFocused: boolean;
  panelHeight: number;
  cursorIndex: number;
  driverName: string;
  onClose: () => void;
}

export const StorySpecViewer: React.FC<StorySpecViewerProps> = ({
  storyKey,
  storyFilePath,
  storyStatus,
  isFocused,
  panelHeight,
  cursorIndex,
  driverName,
  onClose
}) => {
  const [specLines, setSpecLines] = useState<string[]>(['Loading spec...']);
  const [isMissing, setIsMissing] = useState<boolean>(false);

  useEffect(() => {
    if (!storyFilePath) {
      setIsMissing(true);
      return;
    }
    fs.readFile(storyFilePath, 'utf8')
      .then(content => {
        setSpecLines(content.split('\n'));
        setIsMissing(false);
      })
      .catch(() => {
        setIsMissing(true);
      });
  }, [storyFilePath, storyKey]);

  // Reserve border(2) + header(2) + badge bar(1) + footer(1) + margins(2) = 8
  const viewportHeight = Math.max(4, panelHeight - 8);
  const totalLines = specLines.length;
  const clamped = Math.max(0, Math.min(cursorIndex, Math.max(0, totalLines - 1)));
  const startIdx = Math.max(0, Math.min(clamped, Math.max(0, totalLines - viewportHeight)));
  const visible = specLines.slice(startIdx, startIdx + viewportHeight);

  const getLineColor = (line: string): 'cyan' | 'yellow' | 'magenta' | 'white' | 'gray' => {
    if (line.startsWith('# ')) return 'cyan';
    if (line.startsWith('## ')) return 'yellow';
    if (line.startsWith('### ')) return 'magenta';
    if (line.startsWith('- ') || line.startsWith('* ')) return 'white';
    if (line.startsWith('> ')) return 'gray';
    return 'white';
  };

  const isBold = (line: string) => line.startsWith('#');

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
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color={isFocused ? THEME.heading : THEME.subheading}>
          {isFocused ? '❯ ' : '  '}Story Spec Viewer
        </Text>
        <Text color={THEME.muted}>Driver: <Text bold color={THEME.accent}>[{driverName}]</Text></Text>
      </Box>

      {/* Story badge bar */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderColor={THEME.idleBorder}
        paddingX={1}
        marginBottom={0}
      >
        <Text bold color={THEME.accent}>{storyKey}</Text>
        <Text bold color={THEME.statusColor(storyStatus)}>
          {THEME.statusIcon(storyStatus)} {storyStatus}
        </Text>
      </Box>

      {/* Spec content viewport */}
      <Box flexDirection="column" flexGrow={1}>
        {isMissing ? (
          <Box flexDirection="column" gap={1} marginTop={1} paddingX={1}>
            <Text bold color={THEME.accent}>📝 Story Specification Pending</Text>
            <Box flexDirection="column" borderStyle="single" borderColor={THEME.idleBorder} paddingX={1}>
              <Text color="white">Story Key: <Text color={THEME.accent} bold>{storyKey}</Text></Text>
              <Text color="white">Status: <Text color={THEME.statusColor(storyStatus)} bold>{storyStatus}</Text></Text>
              <Text color="gray" wrap="truncate">Target: {storyFilePath || 'Unspecified'}</Text>
            </Box>
            <Text color="cyan">
              ★ Supervisor Agent is loaded and ready for this story.
            </Text>
            <Text color="gray">
              • Press <Text color={THEME.accent} bold>[r]</Text> or type <Text color={THEME.accent} bold>"run"</Text> to generate spec & execute story.
            </Text>
            <Text color="gray">
              • Press <Text color={THEME.accent} bold>[Esc]</Text> to switch to Supervisor Chat thread.
            </Text>
          </Box>
        ) : visible.map((line: string, idx: number) => (
          <Text
            key={startIdx + idx}
            color={getLineColor(line)}
            bold={isBold(line)}
            wrap="truncate"
          >
            {line || ' '}
          </Text>
        ))}
      </Box>

      {/* Footer hint */}
      <Box justifyContent="space-between">
        {isFocused && !isMissing && totalLines > viewportHeight && (
          <Text color={THEME.muted} dimColor>
            [↑/↓] Scroll  {startIdx + 1}–{Math.min(startIdx + viewportHeight, totalLines)}/{totalLines}
          </Text>
        )}
        <Text color={THEME.muted} dimColor>[Esc] Back to chat</Text>
      </Box>
    </Box>
  );
};
