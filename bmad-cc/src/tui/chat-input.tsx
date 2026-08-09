import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface ChatInputProps {
  isFocused: boolean;
  onSubmit: (text: string) => void;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  isFocused,
  onSubmit,
  placeholder = 'Type directive for Supervisor Agent (e.g., "run", "pause", "driver opencode", "help")...'
}) => {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1));
      return;
    }

    // Ignore Tab, Escape, Arrow keys, and special control chars
    if (
      key.tab ||
      key.escape ||
      key.upArrow ||
      key.downArrow ||
      key.leftArrow ||
      key.rightArrow ||
      key.ctrl ||
      key.meta
    ) {
      return;
    }

    if (input) {
      setValue(prev => prev + input);
    }
  });

  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
      width="100%"
    >
      <Text bold color={isFocused ? 'cyan' : 'gray'}>💬 Directive &gt; </Text>
      {value ? (
        <Text color="white">{value}</Text>
      ) : (
        <Text color="gray">{placeholder}</Text>
      )}
      {isFocused && <Text color="cyan" bold>█</Text>}
    </Box>
  );
};
