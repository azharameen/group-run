import { describe, test, expect, vi, beforeEach } from 'vitest';
import { eventToMessage, groupMessages, messageBadgeVariant, EVENT_LABELS } from '@/lib/chat-utils';
import type { StreamEvent } from '@/api/client';

// Helper to create a base StreamEvent
const createEvent = (overrides: Partial<StreamEvent> = {}): StreamEvent => ({
  type: 'message',
  id: undefined,
  content: undefined,
  text: undefined,
  agent: undefined,
  speaker: undefined,
  role: undefined,
  tool: undefined,
  params: undefined,
  output: undefined,
  action: undefined,
  from_agent: undefined,
  to_agent: undefined,
  interrupt_id: undefined,
  decision: undefined,
  reason: undefined,
  provenance: undefined,
  state: undefined,
  status: undefined,
  extras: undefined,
  tasks: undefined,
  completed: undefined,
  total: undefined,
  response: undefined,
  code: undefined,
  message: undefined,
  retryable: undefined,
  error: undefined,
  routing_key: undefined,
  index: undefined,
  ...overrides,
});

describe('eventToMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-01-01T12:00:00Z') });
  });

  test('converts state_update event with string response', () => {
    const evt = createEvent({
      type: 'state_update',
      response: { text: 'Hello from agent' },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Hello from agent');
    expect(msg.sender).toBe('Agent');
    expect(msg.eventType).toBe('state_update');
  });

  test('converts state_update event with object response containing .text', () => {
    const evt = createEvent({
      type: 'state_update',
      response: { text: 'Agent text response' },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Agent text response');
  });

  test('converts state_update event with object response containing .content', () => {
    const evt = createEvent({
      type: 'state_update',
      response: { content: 'Agent content response' },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Agent content response');
  });

  test('converts state_update event with object response containing .output', () => {
    const evt = createEvent({
      type: 'state_update',
      response: { output: 'Agent output response' },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Agent output response');
  });

  test('converts state_update event with JSON string response', () => {
    const evt = createEvent({
      type: 'state_update',
      response: { text: 'JSON parsed text' },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('JSON parsed text');
  });

  test('converts error event with nested error object', () => {
    const evt = createEvent({
      type: 'error',
      error: { code: 'AGENT_TIMEOUT', message: 'Agent timed out', retryable: true },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Agent timed out');
    expect(msg.eventType).toBe('error');
  });

  test('converts error event with flat error fields', () => {
    const evt = createEvent({
      type: 'error',
      code: 'RATE_LIMIT',
      message: 'Rate limited',
      retryable: true,
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Rate limited');
  });

  test('converts error event with unknown error', () => {
    const evt = createEvent({ type: 'error' });
    const msg = eventToMessage(evt);
    expect(msg.text).toContain('Error:');
  });

  test('formats tool_use event', () => {
    const evt = createEvent({
      type: 'tool_use',
      tool: 'web_search',
      params: { description: 'Searching the web', input: {} },
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toContain('Searching the web');
    expect(msg.text).toContain('`web_search`');
  });

  test('formats tool_result event with output', () => {
    const evt = createEvent({
      type: 'tool_result',
      tool: 'web_search',
      output: 'Search results found',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toContain('Tool `web_search` completed');
    expect(msg.text).toContain('Search results found');
  });

  test('truncates tool_result output at 500 chars', () => {
    const longOutput = 'x'.repeat(600);
    const evt = createEvent({
      type: 'tool_result',
      tool: 'big_tool',
      output: longOutput,
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toContain('...');
    expect(msg.text.length).toBeLessThan(600);
  });

  test('formats agent_start event', () => {
    const evt = createEvent({
      type: 'agent_start',
      agent: 'researcher',
      action: 'starting',
      text: 'Beginning research',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toContain('Agent `researcher` is starting');
  });

  test('formats agent_stop event', () => {
    const evt = createEvent({
      type: 'agent_stop',
      agent: 'researcher',
      action: 'stopped',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toContain('Agent `researcher` is stopped');
  });

  test('formats transition event (orchestrator)', () => {
    const evt = createEvent({
      type: 'transition',
      content: 'Routing to ideas team',
      agent: 'orchestrator',
      speaker: 'Orchestrator',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Routing to ideas team');
  });

  test('maps reasoning event to thinking eventType', () => {
    const evt = createEvent({
      type: 'reasoning',
      text: 'Thinking about approach',
    });
    const msg = eventToMessage(evt);
    expect(msg.eventType).toBe('thinking');
  });

  test('converts generic event with only content field', () => {
    const evt = createEvent({
      type: 'message',
      content: 'Generic message content',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Generic message content');
  });

  test('converts generic event with text field', () => {
    const evt = createEvent({
      type: 'message',
      text: 'Generic text content',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('Generic text content');
  });

  test('unwraps JSON array in evt.text to extract visible text', () => {
    const evt = createEvent({
      type: 'message',
      text: '[{"text": "first"}, {"content": "second"}]',
    });
    const msg = eventToMessage(evt);
    expect(msg.text).toBe('firstsecond');
  });

  test('generates unique IDs when evt.id is absent', () => {
    const evt1 = createEvent({ type: 'message', content: 'a' });
    const evt2 = createEvent({ type: 'message', content: 'b' });
    const msg1 = eventToMessage(evt1);
    const msg2 = eventToMessage(evt2);
    expect(msg1.id).not.toBe(msg2.id);
    expect(msg1.id).toBeDefined();
  });

  test('uses evt.id when provided', () => {
    const evt = createEvent({ type: 'message', id: 'custom-id', content: 'test' });
    const msg = eventToMessage(evt);
    expect(msg.id).toBe('custom-id');
  });

  test('sets correct timestamp format', () => {
    const evt = createEvent({ type: 'message', content: 'test' });
    const msg = eventToMessage(evt);
    expect(msg.timestamp).toMatch(/\d{2}:\d{2}/);
  });

  test('sets sender from speaker when available', () => {
    const evt = createEvent({ type: 'message', speaker: 'Custom Agent', content: 'hi' });
    const msg = eventToMessage(evt);
    expect(msg.sender).toBe('Custom Agent');
  });

  test('sets sender from agent when speaker is absent', () => {
    const evt = createEvent({ type: 'message', agent: 'fallback-agent', content: 'hi' });
    const msg = eventToMessage(evt);
    expect(msg.sender).toBe('fallback-agent');
  });

  test('falls back to EVENT_LABELS for sender', () => {
    const evt = createEvent({ type: 'thinking', content: 'hi' });
    const msg = eventToMessage(evt);
    expect(msg.sender).toBe('Thinking');
  });

  test('sets liveTrace array with event details', () => {
    const evt = createEvent({ type: 'tool_use', tool: 'my_tool', content: 'test' });
    const msg = eventToMessage(evt);
    expect(msg.liveTrace).toBeDefined();
    expect(msg.liveTrace?.length).toBe(1);
    expect(msg.liveTrace?.[0].tool).toBe('my_tool');
  });
});

describe('groupMessages', () => {
  test('merges consecutive messages from same sender with eventType message', () => {
    const msgs = [
      { id: '1', sender: 'Assistant', text: 'Hello', eventType: 'message', timestamp: '' },
      { id: '2', sender: 'Assistant', text: 'World', eventType: 'message', timestamp: '' },
    ];
    const result = groupMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello\nWorld');
  });

  test('keeps messages from different senders separate', () => {
    const msgs = [
      { id: '1', sender: 'You', text: 'Hi', eventType: 'message', timestamp: '' },
      { id: '2', sender: 'Assistant', text: 'Hello', eventType: 'message', timestamp: '' },
    ];
    const result = groupMessages(msgs);
    expect(result).toHaveLength(2);
  });

  test('does not merge non-message eventTypes', () => {
    const msgs = [
      { id: '1', sender: 'Assistant', text: 'Thinking', eventType: 'thinking', timestamp: '' },
      { id: '2', sender: 'Assistant', text: 'Answer', eventType: 'message', timestamp: '' },
    ];
    const result = groupMessages(msgs);
    expect(result).toHaveLength(2);
  });

  test('does not merge message after non-message', () => {
    const msgs = [
      { id: '1', sender: 'Assistant', text: 'Tool', eventType: 'tool_call', timestamp: '' },
      { id: '2', sender: 'Assistant', text: 'Answer', eventType: 'message', timestamp: '' },
    ];
    const result = groupMessages(msgs);
    expect(result).toHaveLength(2);
  });

  test('preserves liveTrace when merging', () => {
    const msgs = [
      { id: '1', sender: 'A', text: 't1', eventType: 'message', liveTrace: [{ type: 'thinking' as const }], timestamp: '' },
      { id: '2', sender: 'A', text: 't2', eventType: 'message', liveTrace: [{ type: 'tool_call' as const }], timestamp: '' },
    ];
    const result = groupMessages(msgs);
    expect(result[0].liveTrace).toHaveLength(2);
  });

  test('returns empty array for empty input', () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe('messageBadgeVariant', () => {
  test('returns secondary for thinking', () => {
    expect(messageBadgeVariant('thinking')).toBe('secondary');
  });

  test('returns outline for tool_call', () => {
    expect(messageBadgeVariant('tool_call')).toBe('outline');
  });

  test('returns destructive for interrupt', () => {
    expect(messageBadgeVariant('interrupt')).toBe('destructive');
  });

  test('returns destructive for failed', () => {
    expect(messageBadgeVariant('failed')).toBe('destructive');
  });

  test('returns default for message', () => {
    expect(messageBadgeVariant('message')).toBe('default');
  });

  test('returns outline for unknown type', () => {
    expect(messageBadgeVariant('unknown_type')).toBe('outline');
  });

  test('returns outline for undefined type', () => {
    expect(messageBadgeVariant(undefined)).toBe('outline');
  });
});

describe('EVENT_LABELS', () => {
  test('contains entries for all major event types', () => {
    expect(EVENT_LABELS.thinking).toBe('Thinking');
    expect(EVENT_LABELS.tool_call).toBe('Tool Call');
    expect(EVENT_LABELS.tool_result).toBe('Tool Result');
    expect(EVENT_LABELS.subagent).toBe('Subagent');
    expect(EVENT_LABELS.handover).toBe('Handover');
    expect(EVENT_LABELS.interrupt).toBe('Interrupt');
    expect(EVENT_LABELS.approval).toBe('Approval');
    expect(EVENT_LABELS.retry).toBe('Retry');
    expect(EVENT_LABELS.failed).toBe('Failed');
    expect(EVENT_LABELS.completion).toBe('Completion');
    expect(EVENT_LABELS.user_message).toBe('User');
    expect(EVENT_LABELS.transition).toBe('Orchestrator');
    expect(EVENT_LABELS.message).toBe('Message');
    expect(EVENT_LABELS.state_update).toBe('Agent');
    expect(EVENT_LABELS.error).toBe('System Error');
  });
});
