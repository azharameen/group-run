import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;
import type { StoryRow } from './story-status-table.js';

export interface EpicTreeNode {
  epicKey: string;
  total: number;
  done: number;
  stories: StoryRow[];
}

export type FlattenedTreeNode =
  | { type: 'epic'; epicKey: string; done: number; total: number; isExpanded: boolean }
  | { type: 'story'; story: StoryRow; epicKey: string };

export interface EpicTreePanelProps {
  stories: StoryRow[];
  cursorIndex: number;
  currentStoryKey: string | null;
  expandedEpics: Record<string, boolean>;
  isFocused: boolean;
  panelHeight?: number;
}

export const EpicTreePanel: React.FC<EpicTreePanelProps> = ({
  stories,
  cursorIndex,
  currentStoryKey,
  expandedEpics,
  isFocused,
  panelHeight = 18
}: EpicTreePanelProps) => {
  // Group stories into Epics
  const epicsMap: Record<string, StoryRow[]> = {};
  for (const story of stories) {
    if (!epicsMap[story.epic]) {
      epicsMap[story.epic] = [];
    }
    epicsMap[story.epic].push(story);
  }

  const epicNodes: EpicTreeNode[] = Object.entries(epicsMap).map(([epicKey, epicStories]) => {
    const doneCount = epicStories.filter(s => s.status === 'done').length;
    return {
      epicKey,
      total: epicStories.length,
      done: doneCount,
      stories: epicStories
    };
  });

  // Build flattened visible nodes for tree navigation
  const flattenedNodes: FlattenedTreeNode[] = [];
  for (const epic of epicNodes) {
    const isExpanded = expandedEpics[epic.epicKey] ?? false;
    flattenedNodes.push({
      type: 'epic',
      epicKey: epic.epicKey,
      done: epic.done,
      total: epic.total,
      isExpanded
    });

    if (isExpanded) {
      for (const story of epic.stories) {
        flattenedNodes.push({
          type: 'story',
          story,
          epicKey: epic.epicKey
        });
      }
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
        return <Text color="green">✔ done</Text>;
      case 'in-progress':
        return <Text color="yellow">⚡ dev</Text>;
      case 'review':
        return <Text color="cyan">🔍 review</Text>;
      default:
        return <Text color="gray">⚪ backlog</Text>;
    }
  };

  // Viewport window calculation based on dynamic panel height
  const windowSize = Math.max(6, panelHeight - 6);
  const clampedCursor = Math.max(0, Math.min(cursorIndex, Math.max(0, flattenedNodes.length - 1)));
  const startIdx = Math.max(0, Math.min(clampedCursor - 4, flattenedNodes.length - windowSize));
  const visibleNodes = flattenedNodes.slice(startIdx, startIdx + windowSize);

  const hiddenAbove = startIdx;
  const hiddenBelow = Math.max(0, flattenedNodes.length - (startIdx + windowSize));

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={isFocused ? 'cyan' : 'gray'} padding={1} width="100%" height={panelHeight}>
      {/* Sidebar Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          {isFocused ? '❯ ' : '  '}Sprint Epics & Tree
        </Text>
        <Text color="gray">{stories.length} stories</Text>
      </Box>

      {/* Scroll indicator - items above */}
      {hiddenAbove > 0 ? (
        <Text color="gray" dimColor>▲ {hiddenAbove} items above</Text>
      ) : null}

      {/* Viewport items */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleNodes.map((node: FlattenedTreeNode, i: number) => {
          const actualIdx = startIdx + i;
          const isSelected = actualIdx === clampedCursor;

          if (node.type === 'epic') {
            const pct = Math.round((node.done / node.total) * 100) || 0;
            const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

            return (
              <Box key={`epic-${node.epicKey}`} justifyContent="space-between">
                <Text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                  {isSelected ? '❯ ' : '  '}
                  {node.isExpanded ? '▾ ' : '▸ '}
                  {node.epicKey} ({node.done}/{node.total})
                </Text>
                <Text color={pct === 100 ? 'green' : 'yellow'}>{bar}</Text>
              </Box>
            );
          }

          const story = node.story;
          const isExecuting = story.key === currentStoryKey;

          return (
            <Box key={`story-${story.key}`} justifyContent="space-between" marginLeft={2}>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {isSelected ? '❯ ' : '  '}
                {isExecuting ? <Text color="yellow"><Spinner type="dots" /> </Text> : null}
                {story.key.length > 18 ? story.key.substring(0, 16) + '..' : story.key}
              </Text>
              {getStatusBadge(story.status)}
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator - items below */}
      {hiddenBelow > 0 ? (
        <Text color="gray" dimColor>▼ {hiddenBelow} items below</Text>
      ) : null}
    </Box>
  );
};
