import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../theme.js';

export interface FilterModalProps {
  currentEpicFilter: string | undefined;
  currentStatusFilter: string | undefined;
  onApply: (epicFilter: string | undefined, statusFilter: string | undefined) => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'];

export const FilterModal: React.FC<FilterModalProps> = ({
  currentEpicFilter,
  currentStatusFilter,
  onApply,
  onCancel
}) => {
  const [epicInput, setEpicInput] = useState(currentEpicFilter ?? '');
  const [statusInput, setStatusInput] = useState(currentStatusFilter ?? '');
  const [activeField, setActiveField] = useState<'epic' | 'status'>('epic');

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.tab) {
      setActiveField((prev: 'epic' | 'status') => prev === 'epic' ? 'status' : 'epic');
      return;
    }

    if (key.return) {
      const epic = epicInput.trim() || undefined;
      const status = statusInput.trim() || undefined;
      onApply(epic, status);
      return;
    }

    if (key.backspace || key.delete) {
      if (activeField === 'epic') {
        setEpicInput((prev: string) => prev.slice(0, -1));
      } else {
        setStatusInput((prev: string) => prev.slice(0, -1));
      }
      return;
    }

    if (key.ctrl || key.meta || key.upArrow || key.downArrow) return;

    if (input) {
      if (activeField === 'epic') {
        setEpicInput((prev: string) => prev + input);
      } else {
        setStatusInput((prev: string) => prev + input);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={THEME.accent}
      paddingX={2}
      paddingY={1}
      width={50}
      alignSelf="center"
    >
      {/* Title */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={THEME.accent}>⚙  FILTER STORIES</Text>
      </Box>

      {/* Epic Filter Field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={THEME.muted}>Epic (e.g. EP-4, 4, or blank for all):</Text>
        <Box
          borderStyle="single"
          borderColor={activeField === 'epic' ? THEME.focusBorder : THEME.idleBorder}
          paddingX={1}
        >
          <Text color="white">
            {epicInput || <Text color={THEME.muted}>all epics</Text>}
          </Text>
          {activeField === 'epic' && <Text backgroundColor="cyan" color="black"> </Text>}
        </Box>
      </Box>

      {/* Status Filter Field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={THEME.muted}>
          {'Status (' + STATUS_OPTIONS.join(' | ') + '):'}
        </Text>
        <Box
          borderStyle="single"
          borderColor={activeField === 'status' ? THEME.focusBorder : THEME.idleBorder}
          paddingX={1}
        >
          <Text color="white">
            {statusInput || <Text color={THEME.muted}>all statuses</Text>}
          </Text>
          {activeField === 'status' && <Text backgroundColor="cyan" color="black"> </Text>}
        </Box>
      </Box>

      <Text color={THEME.idleBorder}>{'─'.repeat(44)}</Text>

      <Box justifyContent="space-between" marginTop={1}>
        <Text color={THEME.muted}>[Tab] Switch field</Text>
        <Text color={THEME.success}>[Enter] Apply</Text>
        <Text color={THEME.muted}>[Esc] Cancel</Text>
      </Box>
    </Box>
  );
};
