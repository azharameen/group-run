import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from './theme.js';

export interface ChatInputProps {
  isFocused: boolean;
  onSubmit: (text: string) => void;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  isFocused,
  onSubmit,
  placeholder = 'Type a directive (e.g., "run", "pause", "driver gemini", "help")...'
}) => {
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue('');
        setCursorPos(0);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        setValue((prev: string) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
        setCursorPos((prev: number) => prev - 1);
      }
      return;
    }

    // Left/right cursor movement within input
    if (key.leftArrow) {
      setCursorPos((prev: number) => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorPos((prev: number) => Math.min(value.length, prev + 1));
      return;
    }

    // Ignore Tab, Escape, Up/Down, Ctrl/Meta combos
    if (
      key.tab ||
      key.escape ||
      key.upArrow ||
      key.downArrow ||
      key.ctrl ||
      key.meta
    ) {
      return;
    }

    if (input) {
      setValue((prev: string) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((prev: number) => prev + input.length);
    }
  });

  // Render text with cursor block at cursor position
  const beforeCursor = value.slice(0, cursorPos);
  const atCursor = value[cursorPos] ?? ' ';
  const afterCursor = value.slice(cursorPos + 1);
  const showCursor = isFocused;

  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor={isFocused ? THEME.focusBorder : THEME.idleBorder}
      paddingX={1}
      width="100%"
    >
      <Text bold color={isFocused ? THEME.userChat : THEME.muted}>💬 › </Text>
      {value.length === 0 && !showCursor ? (
        <Text color={THEME.muted}>{placeholder}</Text>
      ) : (
        <>
          <Text color="white">{beforeCursor}</Text>
          {showCursor && (
            <Text backgroundColor="cyan" color="black">{atCursor}</Text>
          )}
          <Text color="white">{afterCursor}</Text>
        </>
      )}
    </Box>
  );
};
