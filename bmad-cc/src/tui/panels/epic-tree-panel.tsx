import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;
import { THEME } from '../theme.js';
import type { StoryRow } from '../story-status-table.js';

export type FlattenedTreeNode =
  | { type: 'epic'; epicKey: string; done: number; total: number; isExpanded: boolean }
  | { type: 'story'; story: StoryRow; epicKey: string };

export interface EpicTreePanelProps {
  /** Pre-computed flattened nodes from app.tsx — single source of truth */
  flattenedNodes: FlattenedTreeNode[];
  cursorIndex: number;
  currentStoryKey: string | null;    // currently EXECUTING story (spinner)
  selectedStoryKey: string | null;   // story selected by user in tree (Enter)
  isFocused: boolean;
  panelHeight: number;
  totalStories: number;
  onStorySelect: (storyKey: string, filePath: string | null) => void;
  storyLocationDir: string;
}

export const EpicTreePanel: React.FC<EpicTreePanelProps> = ({
  flattenedNodes,
  cursorIndex,
  currentStoryKey,
  selectedStoryKey,
  isFocused,
  panelHeight,
  totalStories,
  onStorySelect,
  storyLocationDir
}) => {
  // Viewport: reserve border(2) + header(2) + scroll indicators(2) = 6
  const windowSize = Math.max(4, panelHeight - 6);
  const clamped = Math.max(0, Math.min(cursorIndex, Math.max(0, flattenedNodes.length - 1)));
  const startIdx = Math.max(0, Math.min(clamped - Math.floor(windowSize / 2), Math.max(0, flattenedNodes.length - windowSize)));
  const visible = flattenedNodes.slice(startIdx, startIdx + windowSize);
  const hiddenAbove = startIdx;
  const hiddenBelow = Math.max(0, flattenedNodes.length - (startIdx + windowSize));

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
          {isFocused ? '❯ ' : '  '}Epics & Stories
        </Text>
        <Text color={THEME.muted}>{totalStories} stories</Text>
      </Box>

      {/* Scroll up indicator */}
      {hiddenAbove > 0 ? (
        <Text color={THEME.muted} dimColor>{'  ▲ ' + hiddenAbove + ' above'}</Text>
      ) : null}

      {/* Tree nodes */}
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((node: FlattenedTreeNode, i: number) => {
          const actualIdx = startIdx + i;
          const isSelected = actualIdx === clamped;

          if (node.type === 'epic') {
            const pct = node.total > 0 ? Math.round((node.done / node.total) * 100) : 0;
            const barFilled = Math.round(pct / 5); // 20 chars total
            const bar = '▰'.repeat(barFilled) + '▱'.repeat(20 - barFilled);
            const barColor = pct === 100 ? THEME.success : THEME.accent;

            return (
              <Box key={`epic-${node.epicKey}-${i}`} flexDirection="column">
                <Box justifyContent="space-between">
                  <Text
                    color={isSelected ? THEME.accent : THEME.subheading}
                    bold={isSelected}
                  >
                    {isSelected ? '❯ ' : '  '}
                    {node.isExpanded ? '▾ ' : '▸ '}
                    {node.epicKey}
                    <Text color={THEME.muted}> ({node.done}/{node.total})</Text>
                  </Text>
                </Box>
                {/* Mini progress bar under epic header */}
                <Text color={barColor} dimColor>{'    ' + bar}</Text>
              </Box>
            );
          }

          // Story node
          const story = node.story;
          const isExecuting = story.key === currentStoryKey;
          const isHighlighted = story.key === selectedStoryKey;
          const statusColor = THEME.statusColor(story.status);
          const statusIcon = THEME.statusIcon(story.status);

          // Truncate key to fit panel
          const displayKey = story.key.length > 20 ? story.key.slice(0, 18) + '..' : story.key;

          return (
            <Box key={`story-${story.key}-${i}`} justifyContent="space-between" marginLeft={2}>
              <Text
                color={isSelected ? THEME.focusBorder : isHighlighted ? THEME.accent : THEME.subheading}
                bold={isSelected || isHighlighted}
              >
                {isSelected ? '❯ ' : '  '}
                {isExecuting
                  ? <Text color={THEME.accent}><Spinner type="dots" /> </Text>
                  : isHighlighted ? <Text color={THEME.accent}>◆ </Text> : null}
                {displayKey}
              </Text>
              <Text color={statusColor}>{statusIcon}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Scroll down indicator */}
      {hiddenBelow > 0 ? (
        <Text color={THEME.muted} dimColor>{'  ▼ ' + hiddenBelow + ' below'}</Text>
      ) : null}

      {/* Footer hint */}
      {isFocused && (
        <Text color={THEME.muted} dimColor>
          {'  [↑/↓] Nav  [Space/Enter] Expand  [Enter] View Spec'}
        </Text>
      )}
    </Box>
  );
};
