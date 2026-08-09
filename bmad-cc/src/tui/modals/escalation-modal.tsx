import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../theme.js';

export interface EscalationContextInfo {
  storyKey: string;
  reason: string;
  retryCount: number;
  maxRetries: number;
  testOutput?: string;
  reviewFindings?: string;
}

export type EscalationAction = 'retry' | 'retry-with-prompt' | 'override-pass' | 'skip' | 'abort';

export interface EscalationDecisionResult {
  action: EscalationAction;
  customPrompt?: string;
}

export interface EscalationModalProps {
  context: EscalationContextInfo;
  onDecision: (decision: EscalationDecisionResult) => void;
}

const OPTIONS: Array<{ label: string; action: EscalationAction }> = [
  { label: '1. Retry (same prompt)', action: 'retry' },
  { label: '2. Retry with custom instructions', action: 'retry-with-prompt' },
  { label: '3. Override and pass', action: 'override-pass' },
  { label: '4. Skip this story', action: 'skip' },
  { label: '5. Abort entire sprint execution', action: 'abort' }
];

export const EscalationModal: React.FC<EscalationModalProps> = ({ context, onDecision }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPrompting, setIsPrompting] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  useInput((input, key) => {
    if (isPrompting) {
      if (key.return) {
        onDecision({ action: 'retry-with-prompt', customPrompt });
        return;
      }
      if (key.backspace || key.delete) {
        setCustomPrompt(prev => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCustomPrompt(prev => prev + input);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < OPTIONS.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const selected = OPTIONS[selectedIndex];
      if (selected.action === 'retry-with-prompt') {
        setIsPrompting(true);
      } else {
        onDecision({ action: selected.action });
      }
    } else if (['1', '2', '3', '4', '5'].includes(input)) {
      const idx = parseInt(input, 10) - 1;
      const selected = OPTIONS[idx];
      if (selected) {
        if (selected.action === 'retry-with-prompt') {
          setSelectedIndex(idx);
          setIsPrompting(true);
        } else {
          onDecision({ action: selected.action });
        }
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={THEME.errorBorder}
      paddingX={2}
      paddingY={1}
      width={70}
    >
      <Text bold color={THEME.errorText}>
        ⚠️ ESCALATION REQUIRED: {context.storyKey}
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text color={THEME.warningText}>Reason: {context.reason}</Text>
        <Text color={THEME.muted}>
          Retries: {context.retryCount} / {context.maxRetries}
        </Text>
      </Box>

      {context.testOutput && (
        <Box flexDirection="column" marginY={1}>
          <Text bold color={THEME.accent}>Test Output:</Text>
          <Text color={THEME.muted}>
            {context.testOutput.split('\n').slice(0, 4).join('\n')}
          </Text>
        </Box>
      )}

      {context.reviewFindings && (
        <Box flexDirection="column" marginY={1}>
          <Text bold color={THEME.accent}>Review Findings:</Text>
          <Text color={THEME.muted}>
            {context.reviewFindings.split('\n').slice(0, 4).join('\n')}
          </Text>
        </Box>
      )}

      {isPrompting ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={THEME.heading}>Enter custom instructions for agent:</Text>
          <Box borderStyle="single" borderColor={THEME.focusBorder} paddingX={1}>
            <Text>{customPrompt}</Text>
            <Text color={THEME.muted}>█</Text>
          </Box>
          <Text color={THEME.muted}>[Press Enter to submit]</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={THEME.heading}>Select Action (Up/Down or Number 1-5):</Text>
          {OPTIONS.map((opt, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={opt.action}>
                <Text color={isSelected ? THEME.accent : THEME.text} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                  {opt.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
