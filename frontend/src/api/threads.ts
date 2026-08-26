import { authenticatedFetch, request, RequestOptions } from './request';

export type StreamEventType =
  | 'reasoning'
  | 'text'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'tool_use'
  | 'subagent'
  | 'handover'
  | 'interrupt'
  | 'approval'
  | 'retry'
  | 'failed'
  | 'completion'
  | 'token'
  | 'tasks_update'
  | 'state_update'
  | 'agent_run'
  | 'agent_start'
  | 'agent_stop'
  | 'error'
  | 'done'
  | 'transition'
  | 'user_message'
  | 'message';

export interface StateUpdateResponse {
  text?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface TaskItemShape {
  id: string;
  status: string;
  [key: string]: unknown;
}

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
  params?: Record<string, unknown>;
  output?: unknown;
  action?: string;
  from_agent?: string;
  to_agent?: string;
  interrupt_id?: string;
  decision?: 'approve' | 'edit' | 'reject' | 'retry';
  reason?: string;
  provenance?: string;
  state?: string;
  status?: string;
  extras?: Record<string, unknown>;
  tasks?: TaskItemShape[];
  completed?: number;
  total?: number;
  // state_update event fields (flat string or object shape from the backend)
  response?: string | StateUpdateResponse;
  // error event fields (flat shape for compatibility)
  code?: string;
  message?: string;
  retryable?: boolean;
  // error event nested shape (from chat.py)
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  routing_key?: string;
  idea_id?: string;
  research?: Record<string, unknown>;
  validation?: Record<string, unknown>;
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

// ── Interrupt API ──────────────────────────────────────────────────────────

export interface InterruptPayload {
  id: string;
  thread_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  decision?: string;
  reason?: string;
  reasoning?: string;
  decided_by?: string;
  decided_at?: string;
  confidence?: string;
  alternatives?: string[];
  created_at: string;
  updated_at: string;
}

export interface ResumeResponse {
  interrupt: InterruptPayload;
  response: string;
}

export async function fetchPendingInterrupts(options?: RequestOptions): Promise<InterruptPayload[]> {
  const data = await request<{ interrupts?: InterruptPayload[] }>('/interrupts/pending', options);
  return data.interrupts || [];
}

export async function approveInterrupt(
  id: string,
  decision: string,
  reason: string,
  reasoning?: string,
  options?: RequestOptions,
): Promise<InterruptPayload> {
  const data = await request<{ interrupt: InterruptPayload }>(`/interrupts/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ decision, reason, reasoning: reasoning ?? reason }),
    ...options,
  });
  return data.interrupt;
}

export async function rejectInterrupt(
  id: string,
  reason: string,
  reasoning?: string,
  options?: RequestOptions,
): Promise<InterruptPayload> {
  const data = await request<{ interrupt: InterruptPayload }>(`/interrupts/${id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ decision: 'rejected', reason, reasoning: reasoning ?? reason }),
    ...options,
  });
  return data.interrupt;
}

export async function resumeInterrupt(id: string): Promise<ResumeResponse> {
  return request<ResumeResponse>(`/interrupts/${id}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface SSEPayload extends Record<string, unknown> {
  type?: string;
  id?: string;
  idea_id?: string;
  agent_name?: string;
  message?: string;
  interrupt?: Partial<InterruptPayload>;
}

export function connectSSE(
  onEvent: (event: string, data: SSEPayload) => void,
  onError?: (err: Event) => void,
  onInterruptEvent?: (eventType: string, payload: SSEPayload) => void,
): Pick<EventSource, 'close'> {
  let closed = false;
  let activeController: AbortController | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;

  const dispatchFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    try {
      const data = JSON.parse(dataLines.join('\n')) as SSEPayload;
      const type = typeof data.type === 'string' ? data.type : eventName;
      if (type.startsWith('interrupt.')) {
        onInterruptEvent?.(type, data);
      } else {
        onEvent(eventName, data);
      }
    } catch {
      // Ignore malformed frames and continue the stream.
    }
  };

  const connect = async () => {
    if (closed) return;
    activeController = new AbortController();
    try {
      const response = await authenticatedFetch('/sse', {
        headers: { Accept: 'text/event-stream' },
        signal: activeController.signal,
      });
      if (!response.ok || !response.body) throw new Error('SSE connection failed');

      reconnectAttempt = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        frames.forEach(dispatchFrame);
      }
    } catch {
      if (!closed && !activeController?.signal.aborted) {
        onError?.(new Event('error'));
      }
    }

    if (!closed) {
      const delay = Math.min(1000 * 2 ** reconnectAttempt++, 15000);
      reconnectTimer = window.setTimeout(() => void connect(), delay);
    }
  };

  const reconnectForToken = () => {
    if (closed) return;
    activeController?.abort();
  };
  window.addEventListener('companion:id-token-changed', reconnectForToken);
  void connect();

  return {
    close: () => {
      closed = true;
      activeController?.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.removeEventListener('companion:id-token-changed', reconnectForToken);
    },
  };
}

export async function streamChat(
  text: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await authenticatedFetch('/chat/stream', {
    method: 'POST',
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
  const data = await request<{ threads?: ThreadMetadata[] }>('/threads', { signal });
  return (data.threads ?? []) as ThreadMetadata[];
}

export async function createThread(
  req: CreateThreadRequest,
  signal?: AbortSignal,
): Promise<ThreadMetadata> {
  const data = await request<{ thread: ThreadMetadata }>('/threads', {
    method: 'POST',
    body: JSON.stringify(req),
    signal,
  });
  return data.thread as ThreadMetadata;
}

export async function getThread(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadMetadata> {
  const data = await request<{ thread: ThreadMetadata }>(`/threads/${threadId}`, { signal });
  return data.thread as ThreadMetadata;
}

export async function updateThread(
  threadId: string,
  req: UpdateThreadRequest,
  signal?: AbortSignal,
): Promise<ThreadMetadata> {
  const data = await request<{ thread: ThreadMetadata }>(`/threads/${threadId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
    signal,
  });
  return data.thread as ThreadMetadata;
}

export async function deleteThread(
  threadId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(`/threads/${threadId}`, {
    method: 'DELETE',
    signal,
  });
}

export async function streamThreadMessage(
  threadId: string,
  text: string,
  ideaId?: string,
  onEvent?: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await authenticatedFetch(`/threads/${threadId}/stream`, {
    method: 'POST',
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
  return request<{ messages: ThreadMessage[]; count: number }>(
    `/threads/${threadId}/messages`,
    { signal },
  );
}
