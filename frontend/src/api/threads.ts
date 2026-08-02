const API_BASE = '/api';

export type StreamEventType =
  | 'reasoning'
  | 'text'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'subagent'
  | 'handover'
  | 'interrupt'
  | 'approval'
  | 'retry'
  | 'failed'
  | 'completion'
  | 'token'
  | 'tasks_update'
  | 'done'
  | 'transition'
  | 'user_message'
  | 'message';

export interface StreamEvent {
  type: StreamEventType;
  id?: string;
  index?: string;
  content?: string;
  text?: string;
  agent?: string;
  speaker?: string;
  role?: string;
  tool?: string;
  params?: Record<string, any>;
  output?: any;
  action?: string;
  from_agent?: string;
  to_agent?: string;
  interrupt_id?: string;
  decision?: 'approve' | 'edit' | 'reject' | 'retry';
  reason?: string;
  provenance?: string;
  state?: string;
  status?: string;
  extras?: Record<string, any>;
  tasks?: any[];
  completed?: number;
  total?: number;
}

export interface ThreadMetadata {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: string;
  idea_id: string | null;
  tags: string[];
  agent_names: string[];
}

export interface CreateThreadRequest {
  title?: string;
  idea_id?: string | null;
  tags?: string[];
  agent_names?: string[];
}

export interface UpdateThreadRequest {
  title?: string;
  status?: string;
  idea_id?: string | null;
  tags?: string[];
  agent_names?: string[];
}

export interface ThreadMessage {
  id: string;
  type: string;
  content: string;
  role?: string;
  name?: string;
  timestamp?: string;
  additional_kwargs?: Record<string, unknown>;
}

export function connectSSE(
  onEvent: (event: string, data: any) => void,
  onError?: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${API_BASE}/sse`);

  const knownEvents = [
    'idea.created', 'idea.transition', 'idea.scored',
    'agent.progress', 'gate.passed', 'gate.failed',
  ];

  knownEvents.forEach((eventName) => {
    es.addEventListener(eventName, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(eventName, data);
      } catch {
        // ignore parse errors
      }
    });
  });

  es.onerror = (err) => {
    console.error('SSE error:', err);
    onError?.(err);
  };

  return es;
}

export async function streamChat(
  text: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sender: 'user' }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Stream API ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6);
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw) as StreamEvent;
          onEvent(evt);
        } catch {
          // ignore malformed
        }
      }
    }
  }
}

export async function listThreads(signal?: AbortSignal): Promise<ThreadMetadata[]> {
  const res = await fetch(`${API_BASE}/threads`, { signal });
  if (!res.ok) throw new Error(`listThreads ${res.status}`);
  const data = await res.json();
  return (data.threads ?? []) as ThreadMetadata[];
}

export async function createThread(
  req: CreateThreadRequest,
  signal?: AbortSignal,
): Promise<ThreadMetadata> {
  const res = await fetch(`${API_BASE}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(`createThread ${res.status}`);
  const data = await res.json();
  return data.thread as ThreadMetadata;
}

export async function getThread(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadMetadata> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`, { signal });
  if (!res.ok) throw new Error(`getThread ${res.status}`);
  const data = await res.json();
  return data.thread as ThreadMetadata;
}

export async function updateThread(
  threadId: string,
  req: UpdateThreadRequest,
  signal?: AbortSignal,
): Promise<ThreadMetadata> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(`updateThread ${res.status}`);
  const data = await res.json();
  return data.thread as ThreadMetadata;
}

export async function deleteThread(
  threadId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`, {
    method: 'DELETE',
    signal,
  });
  if (!res.ok) throw new Error(`deleteThread ${res.status}`);
}

export async function streamThreadMessage(
  threadId: string,
  text: string,
  ideaId?: string,
  onEvent?: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, idea_id: ideaId ?? null }),
    signal,
  });

  if (!res.ok) throw new Error(`streamThreadMessage ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6);
        if (!raw) continue;
        try {
          onEvent?.(JSON.parse(raw) as StreamEvent);
        } catch {
          // ignore malformed
        }
      }
    }
  }
}

export async function getThreadMessages(
  threadId: string,
  signal?: AbortSignal,
): Promise<{ messages: ThreadMessage[]; count: number }> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/messages`, { signal });
  if (!res.ok) throw new Error(`getThreadMessages ${res.status}`);
  return res.json();
}
