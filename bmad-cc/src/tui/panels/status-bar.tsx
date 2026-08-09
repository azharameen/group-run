import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export interface StatusBarProps {
  activeStoryKey: string | null;
  activePhase: string;
  driverName: string;
  completedStories: number;
  totalStories: number;
  elapsedMs: number;
  isRunning: boolean;
  focusedPane: string;
  appMode: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeStoryKey,
  activePhase,
  driverName,
  completedStories,
  totalStories,
  elapsedMs,
  isRunning,
  focusedPane,
  appMode
}) => {
  const storyLabel = activeStoryKey
    ? activeStoryKey.length > 16 ? activeStoryKey.slice(0, 14) + '..' : activeStoryKey
    : 'Idle';

  const phaseColor = THEME.phaseColor(activePhase);
  const phaseLabel = THEME.phaseLabel(activePhase);

  const pct = totalStories > 0 ? Math.round((completedStories / totalStories) * 100) : 0;
  const barFilled = Math.round(pct / 10);
  const bar = '▰'.repeat(barFilled) + '▱'.repeat(10 - barFilled);

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="single"
      borderColor={isRunning ? THEME.activeBorder : THEME.idleBorder}
      paddingX={1}
      width="100%"
    >
      {/* Left: Story + Phase */}
      <Box gap={1}>
        <Text color={THEME.muted}>Story:</Text>
        <Text bold color={activeStoryKey ? THEME.accent : THEME.muted}>{storyLabel}</Text>
        <Text color={THEME.muted}>│</Text>
        <Text color={phaseColor} bold>{phaseLabel}</Text>
        <Text color={THEME.muted}>│</Text>
        <Text color={THEME.muted}>Driver:</Text>
        <Text bold color={THEME.info}>[{driverName}]</Text>
      </Box>

      {/* Center: Progress */}
      <Box gap={1}>
        <Text color={pct === 100 ? THEME.success : THEME.accent}>{bar}</Text>
        <Text color={THEME.muted}>{completedStories}/{totalStories}</Text>
        <Text color={THEME.muted}>│</Text>
        <Text color={THEME.muted}>{formatTime(elapsedMs)}</Text>
      </Box>

      {/* Right: Focus + Keybindings hint */}
      <Box gap={1}>
        <Text color={THEME.muted}>Focus:</Text>
        <Text bold color={THEME.focusBorder}>[{focusedPane.toUpperCase()}]</Text>
        <Text color={THEME.muted}>│</Text>
        <Text color={THEME.muted}>[Tab] Pane</Text>
        <Text color={THEME.muted}>[r] Run</Text>
        <Text color={THEME.muted}>[p] Pause</Text>
        <Text color={THEME.muted}>[g] Diff</Text>
        <Text color={THEME.muted}>[?] Help</Text>
        <Text color={THEME.muted}>[Esc] Back</Text>
      </Box>
    </Box>
  );
};
