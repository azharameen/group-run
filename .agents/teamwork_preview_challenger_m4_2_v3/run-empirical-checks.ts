import assert from 'node:assert';
import React from 'react';
import { render } from 'ink-testing-library';
import { stripAnsi, cleanAndSplitLines } from '../../bmad-cc/src/utils/ansi-cleaner.js';
import { StreamThrottler } from '../../bmad-cc/src/utils/stream-throttler.js';
import { AgentOutputStream } from '../../bmad-cc/src/tui/agent-output-stream.js';
import { App } from '../../bmad-cc/src/tui/app.js';
import type { DashboardState } from '../../bmad-cc/src/tui/render-dashboard.js';

console.log('=== EMPIRICAL STRESS TEST HARNESS — MILESTONE 4 ===\n');

// 1. ANSI STRIpper TEST
console.log('[TEST 1] ANSI Cleaner OSC 8 Hyperlink & Multi-Code Stripping');
const osc8Hyperlink = '\u001b]8;;https://example.com\x07Click Here\u001b]8;;\x07';
const cleanedOsc8 = stripAnsi(osc8Hyperlink);
console.log('  Input OSC 8:', JSON.stringify(osc8Hyperlink));
console.log('  Output stripped:', JSON.stringify(cleanedOsc8));

if (cleanedOsc8.includes('\u001b') || cleanedOsc8.includes('\x07') || cleanedOsc8.includes('8;;https')) {
  console.error('  [FAIL] stripAnsi failed to clean OSC 8 hyperlink escape sequence properly!');
} else {
  console.log('  [PASS] stripAnsi cleaned OSC 8 sequence.');
}

const complex24Bit = '\u001b[38;2;255;128;0m\u001b[1m[RGB BOLD]\u001b[0m Status OK';
const cleaned24Bit = stripAnsi(complex24Bit);
console.log('  Input 24-bit:', JSON.stringify(complex24Bit));
console.log('  Output stripped:', JSON.stringify(cleaned24Bit));
if (cleaned24Bit !== '[RGB BOLD] Status OK') {
  console.error(`  [FAIL] stripAnsi returned "${cleaned24Bit}", expected "[RGB BOLD] Status OK"`);
} else {
  console.log('  [PASS] stripAnsi cleaned 24-bit color sequence.');
}

// 2. HIGH FREQUENCY LOG STREAM STRESS
console.log('\n[TEST 2] High-Frequency Log Stream Stress & Throttling');
const throttledItems: string[][] = [];
const throttler = new StreamThrottler<string>((batch) => {
  throttledItems.push(batch);
}, 50);

const startTime = Date.now();
for (let i = 0; i < 20000; i++) {
  throttler.push(`log-line-${i}-\u001b[31mFAIL\u001b[0m-\u001b[32mPASS\u001b[0m`);
}
throttler.flush();
const duration = Date.now() - startTime;
console.log(`  Pushed 20,000 log lines and flushed in ${duration}ms.`);
console.log(`  Flushed batch count: ${throttledItems.length}, total items in batch: ${throttledItems[0]?.length}`);
if (throttledItems[0]?.length === 20000) {
  console.log('  [PASS] High-frequency stream batching survived burst without item loss.');
} else {
  console.error('  [FAIL] StreamThrottler dropped items during burst.');
}

const agentStream = new AgentOutputStream(20);
for (const line of throttledItems[0] || []) {
  agentStream.append(line);
}
console.log(`  AgentOutputStream lines capped at: ${agentStream.totalLines()}`);
if (agentStream.totalLines() === 20) {
  console.log('  [PASS] AgentOutputStream strictly capped lines at 20.');
} else {
  console.error(`  [FAIL] AgentOutputStream total lines were ${agentStream.totalLines()}, expected 20.`);
}

// 3. MODAL OVERLAY KEY HANDLING & STATE FLOW
console.log('\n[TEST 3] Modal Overlay Key Handling & State Flow');

const baseState: DashboardState = {
  projectName: 'Empirical M4 Test Project',
  totalStories: 2,
  completedStories: 0,
  inProgressStories: 1,
  currentStoryKey: 'STORY-1',
  currentPhase: 'develop',
  activeSkill: 'bmad-dev-story',
  stories: [
    { key: 'STORY-1', epic: 'EP-1', status: 'in-progress', phase: 'dev', retries: 0 }
  ],
  agentOutput: 'Ready...',
  elapsedTime: 0,
  driverName: 'gemini'
};

async function testModalKeyHandling() {
  const mockEscalation = {
    storyKey: 'STORY-1',
    reason: 'Gate decision: ESCALATE_TO_HUMAN',
    retryCount: 3,
    maxRetries: 3,
    testOutput: 'Test failure details'
  };

  const stateWithEscalation: DashboardState = {
    ...baseState,
    escalationContext: mockEscalation,
    onEscalationDecision: (dec) => console.log('Escalation decision fired:', dec)
  };

  const { lastFrame, stdin } = render(React.createElement(App, { initialState: stateWithEscalation }));
  const initialFrame = lastFrame();
  console.log('  EscalationModal initial render contains title:', initialFrame.includes('ESCALATION REQUIRED: STORY-1'));

  // Send '?' key while Escalation Modal is active
  stdin.write('?');
  await new Promise(r => setTimeout(r, 50));
  const frameAfterQuestion = lastFrame();

  if (frameAfterQuestion.includes('BMad Command Center — Keyboard Reference')) {
    console.error('  [FAIL] Key leakage: "?" key in EscalationModal caused App to navigate to HelpOverlay mode!');
  } else {
    console.log('  [PASS] "?" key was consumed by EscalationModal without opening HelpOverlay.');
  }

  // Send 'g' key while Escalation Modal is active
  stdin.write('g');
  await new Promise(r => setTimeout(r, 50));
  const frameAfterG = lastFrame();

  if (frameAfterG.includes('GIT DIFF')) {
    console.error('  [FAIL] Key leakage: "g" key in EscalationModal caused App to navigate to GitDiffModal mode!');
  } else {
    console.log('  [PASS] "g" key was consumed by EscalationModal without opening GitDiffModal.');
  }

  // Send 'f' key while Escalation Modal is active
  stdin.write('f');
  await new Promise(r => setTimeout(r, 50));
  const frameAfterF = lastFrame();

  if (frameAfterF.includes('FILTER STORIES')) {
    console.error('  [FAIL] Key leakage: "f" key in EscalationModal caused App to open FilterModal mode!');
  } else {
    console.log('  [PASS] "f" key was consumed by EscalationModal without opening FilterModal.');
  }
}

testModalKeyHandling().then(() => {
  console.log('\n=== EMPIRICAL CHECKS COMPLETED ===');
}).catch(err => {
  console.error('Execution error:', err);
});
