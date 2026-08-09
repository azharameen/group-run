import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../theme.js';

export interface QueryModalProps {
  rawPrompt: string;
  onAnswer: (answer: string) => void;
}

export const QueryModal: React.FC<QueryModalProps> = ({ rawPrompt, onAnswer }) => {
  const [customAnswer, setCustomAnswer] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useInput((input, key) => {
    if (isTyping) {
      if (key.return) {
        onAnswer(customAnswer.trim() || 'y');
        return;
      }
      if (key.backspace || key.delete) {
        setCustomAnswer((prev: string) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCustomAnswer((prev: string) => prev + input);
      }
      return;
    }

    if (input.toLowerCase() === 'y') {
      onAnswer('y');
    } else if (input.toLowerCase() === 'n') {
      onAnswer('n');
    } else if (key.return) {
      onAnswer('y');
    } else if (input.toLowerCase() === 'c') {
      setIsTyping(true);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.accent}
      paddingX={2}
      paddingY={1}
      width={65}
    >
      <Text bold color={THEME.heading}>
        ❓ SUB-AGENT INTERACTIVE PROMPT
      </Text>

      <Box marginY={1} borderStyle="round" borderColor={THEME.muted} paddingX={1}>
        <Text color={THEME.text}>{rawPrompt}</Text>
      </Box>

      {isTyping ? (
        <Box flexDirection="column">
          <Text color={THEME.accent}>Type response:</Text>
          <Box borderStyle="single" borderColor={THEME.focusBorder} paddingX={1}>
            <Text>{customAnswer}</Text>
            <Text color={THEME.muted}>█</Text>
          </Box>
          <Text color={THEME.muted}>[Press Enter to send response to sub-agent]</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={0}>
          <Text bold color={THEME.muted}>Quick Responses:</Text>
          <Text color={THEME.success}> [y] — Confirm / Yes (Default)</Text>
          <Text color={THEME.errorText}> [n] — Cancel / No</Text>
          <Text color={THEME.warningText}> [c] — Type Custom Answer</Text>
        </Box>
      )}
    </Box>
  );
};
