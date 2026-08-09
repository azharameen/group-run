import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { THEME } from '../theme.js';

const KEYBINDINGS: Array<{ key: string; description: string }> = [
  { key: '[Tab]',     description: 'Cycle pane focus (Tree → Console → Monitor)' },
  { key: '[↑/↓]',    description: 'Scroll focused pane / chat history' },
  { key: '[Enter]',   description: 'Expand epic / View story spec / Inspect log' },
  { key: '[Space]',   description: 'Toggle epic expand/collapse' },
  { key: '[r]',       description: 'Run sprint execution' },
  { key: '[p]',       description: 'Pause sprint execution' },
  { key: '[d]',       description: 'Cycle active driver (gemini → opencode → copilot…)' },
  { key: '[v]',       description: 'Open Log Inspector for selected monitor line' },
  { key: '[g]',       description: 'Open Live Git Diff Inspector' },
  { key: '[f]',       description: 'Filter stories by epic or status' },
  { key: '[?]',       description: 'Toggle this help overlay' },
  { key: '[Esc]',     description: 'Close overlay / Return to chat view / Quit (if idle)' },
  { key: '[Ctrl+C]',  description: 'Force quit' },
];

export const HelpOverlay: React.FC = () => {
  const { stdout } = useStdout();
  const termCols = stdout?.columns || 100;
  const termRows = stdout?.rows || 30;

  const boxWidth = Math.min(70, termCols - 4);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={THEME.focusBorder}
      paddingX={2}
      paddingY={1}
      width={boxWidth}
      alignSelf="center"
    >
      {/* Title */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={THEME.heading}>⌨  KEYBINDING REFERENCE</Text>
      </Box>

      <Text color={THEME.idleBorder}>{'─'.repeat(Math.max(10, boxWidth - 6))}</Text>

      {/* Keybinding rows */}
      {KEYBINDINGS.map(({ key, description }) => (
        <Box key={key} flexDirection="row" gap={1}>
          <Text bold color={THEME.accent} >
            {key.padEnd(12)}
          </Text>
          <Text color="white">{description}</Text>
        </Box>
      ))}

      <Text color={THEME.idleBorder}>{'─'.repeat(Math.max(10, boxWidth - 6))}</Text>

      <Box justifyContent="center" marginTop={1}>
        <Text color={THEME.muted}>[?] or [Esc] to close</Text>
      </Box>
    </Box>
  );
};
