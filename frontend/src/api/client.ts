const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Types ──

export interface IdeaListItem {
  idea_id: string
  title: string
  phase: string
  state: string
  composite_score: number
  strength_rating: string
  running_agent: string
  active_processing?: boolean
  paused_processing?: boolean
  active_agent?: string
  active_state?: string
  created_at: string
  updated_at: string
}

export interface IdeaDetail {
  idea: Record<string, any>
  state: Record<string, any>
  scores: Record<string, any>
  comments?: Array<{
    author: string
    text: string
    timestamp: string
  }>
  transcript_events?: Array<Record<string, any>>
  transcript?: Array<Record<string, any>>
}

export interface ArtifactRevision {
  artifact_name: string
  version: number
  timestamp: string
  path: string
  file_name: string
  content: string
  diff: string
  provenance: string
  trust: string
  evidence_refs: string[]
}

export interface CriterionDetail {
  score: number
  reasoning: string
  confidence: number
}

export interface ScoreResult {
  composite: number
  breakdown: Record<string, number>
  criteria_detail: Record<string, CriterionDetail>
  summary: string
  change_explanation: string
  strength_rating: string
  meets_threshold: boolean
  threshold_reason: string
}

export interface PhaseGroup {
  name: string
  states: string[]
  color: string
}

export interface Stats {
  total_ideas: number
  by_phase: Record<string, number>
  by_state: Record<string, number>
  average_score: number
  ideas_above_threshold: number
  ideas_at_threshold: number
}

// ── API Functions ──

export async function fetchIdeas(params?: { phase?: string; state?: string; min_score?: number }): Promise<IdeaListItem[]> {
  const query = new URLSearchParams()
  if (params?.phase) query.set('phase', params.phase)
  if (params?.state) query.set('state', params.state)
  if (params?.min_score !== undefined) query.set('min_score', String(params.min_score))
  const qs = query.toString()
  const data = await request<{ ideas: IdeaListItem[] }>(`/ideas${qs ? `?${qs}` : ''}`)
  return data.ideas
}

export interface IdeaFile {
  path: string
  filename: string
  ext: string
  size_bytes: number
  modified_at: string
  content: string
}

export async function fetchIdeaDetail(ideaId: string): Promise<IdeaDetail> {
  return request<IdeaDetail>(`/ideas/${ideaId}`)
}

export async function fetchIdeaFiles(ideaId: string): Promise<IdeaFile[]> {
  const res = await request<{ idea_id: string; files: IdeaFile[] }>(`/ideas/${ideaId}/files`)
  return res.files || []
}

export async function fetchIdeaRevisions(ideaId: string): Promise<ArtifactRevision[]> {
  const res = await request<{ idea_id: string; revisions: ArtifactRevision[] }>(`/ideas/${ideaId}/revisions`)
  return res.revisions || []
}

export async function fetchArtifactDiff(ideaId: string, artifactName: string): Promise<any> {
  return request(`/ideas/${ideaId}/artifacts/${encodeURIComponent(artifactName)}/diff`)
}

export async function createIdea(signalText: string, title?: string): Promise<{ idea_id: string; score: ScoreResult }> {
  return request('/ideas', {
    method: 'POST',
    body: JSON.stringify({ signal_text: signalText, title: title || '' }),
  })
}

export async function advanceIdea(ideaId: string, targetState?: string): Promise<any> {
  return request(`/ideas/${ideaId}/advance`, {
    method: 'POST',
    body: JSON.stringify({ target_state: targetState }),
  })
}

export async function scoreIdea(ideaId: string): Promise<ScoreResult> {
  return request(`/ideas/${ideaId}/score`, { method: 'POST' })
}

export async function deleteIdea(ideaId: string): Promise<{ idea_id: string; deleted: boolean }> {
  return request(`/ideas/${ideaId}`, { method: 'DELETE' })
}

export async function pauseIdea(ideaId: string): Promise<{ idea_id: string; paused_processing: boolean }> {
  return request(`/ideas/${ideaId}/pause`, { method: 'POST' })
}

export async function resumeIdea(ideaId: string): Promise<{ idea_id: string; paused_processing: boolean }> {
  return request(`/ideas/${ideaId}/resume`, { method: 'POST' })
}

export async function addIdeaComment(ideaId: string, text: string, author = 'User'): Promise<any> {
  return request(`/ideas/${ideaId}/comment`, {
    method: 'POST',
    body: JSON.stringify({ author, text }),
  })
}

export async function validateGate(ideaId: string, gateName: string): Promise<any> {
  return request(`/ideas/${ideaId}/validate-gate`, {
    method: 'POST',
    body: JSON.stringify({ gate_name: gateName }),
  })
}

export async function updateIdea(ideaId: string, field: string, value: any): Promise<any> {
  return request(`/ideas/${ideaId}/update`, {
    method: 'POST',
    body: JSON.stringify({ field, value }),
  })
}

export async function addEvidence(ideaId: string, source: string, content: string): Promise<any> {
  return request(`/ideas/${ideaId}/evidence`, {
    method: 'POST',
    body: JSON.stringify({ source, content }),
  })
}

export async function triggerCycle(): Promise<any> {
  return request('/workflow/cycle', { method: 'POST' })
}

export async function seedIdeas(count: number = 3): Promise<{ seeded: string[] }> {
  return request('/workflow/seed', {
    method: 'POST',
    body: JSON.stringify({ count }),
  })
}

export async function fetchStats(): Promise<Stats> {
  return request<Stats>('/stats')
}

export async function fetchPhases(): Promise<Record<string, PhaseGroup>> {
  return request('/phases')
}

export interface KBDocument {
  source: string
  path: string
  filename: string
  content: string | Record<string, any>
}

export interface KnowledgeBaseData {
  documents: KBDocument[]
  count: number
  sources: { raw: number; processed: number }
}

export async function fetchKnowledgeBase(): Promise<KnowledgeBaseData> {
  return request<KnowledgeBaseData>('/knowledge-base')
}

export interface WorkflowStatus {
  active_idea_id: string
  active_idea: {
    idea_id: string
    title: string
    state: string
    phase: string
    active_processing: boolean
    paused_processing?: boolean
    active_agent: string
    active_state: string
    active_message: string
    composite_score: number
    running_agent?: string
    created_at?: string
  } | null
  queued_count: number
  queued_ideas: Array<{
    idea_id: string
    title: string
    state: string
    phase: string
    active_processing: boolean
    paused_processing?: boolean
    active_agent: string
    active_state: string
    active_message: string
    composite_score: number
    running_agent?: string
    created_at?: string
  }>
  one_idea_focus: boolean
}

export async function fetchWorkflowStatus(): Promise<WorkflowStatus> {
  return request<WorkflowStatus>('/workflow/status')
}

// ── Config API ──

export interface StateConfig {
  label: string
  phase: string
  description: string
}

export interface PhaseMeta {
  label: string
  color: string
}

export interface WorkflowConfig {
  states: Record<string, StateConfig>
  phases: Record<string, PhaseMeta>
  ordered_states: string[]
}

export async function fetchWorkflowConfig(): Promise<WorkflowConfig> {
  return request<WorkflowConfig>('/config/workflow')
}

export interface GateItem {
  id: string
  description: string
}

export interface GateChecklist {
  items: GateItem[]
}

export interface GateConfig {
  gates: Record<string, GateChecklist>
}

export async function fetchGateConfig(): Promise<GateConfig> {
  return request<GateConfig>('/config/gates')
}

export async function fetchCriteriaConfig(): Promise<any> {
  return request('/config/criteria')
}

export interface Topic {
  TopicId: number
  TopicName: string
  TopicDescription: string
}

export async function fetchTopics(): Promise<Topic[]> {
  try {
    return await request<Topic[]>('/config/topics')
  } catch {
    return []
  }
}

export interface Project {
  ProjectID: number
  ProjectName: string
  SBUName: string
  LoBName: string
}

export async function fetchProjects(): Promise<Project[]> {
  try {
    return await request<Project[]>('/config/projects')
  } catch {
    return []
  }
}

export async function generateAutonomousIdeas(maxIdeas: number = 3): Promise<any> {
  return request('/workflow/autonomous', {
    method: 'POST',
    body: JSON.stringify({ max_ideas: maxIdeas }),
  })
}

export async function findAutoPipeline(inputText: string, maxIdeas: number = 3): Promise<any> {
  return request('/auto-pipeline', {
    method: 'POST',
    body: JSON.stringify({ input_text: inputText, max_ideas: maxIdeas }),
  })
}

export async function submitPipeline(
  inputText: string = '',
  maxIdeas: number = 3,
  extra?: { topicName?: string; ideaCategory?: string; projectName?: string },
): Promise<any> {
  return request('/submit-pipeline', {
    method: 'POST',
    body: JSON.stringify({
      input_text: inputText,
      max_ideas: maxIdeas,
      topic_name: extra?.topicName || '',
      idea_category: extra?.ideaCategory || '',
      project_name: extra?.projectName || '',
    }),
  })
}

// ── SSE Connection for Live Updates ──

export function connectSSE(
  onEvent: (event: string, data: any) => void,
  onError?: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${API_BASE}/sse`)

  const knownEvents = [
    'idea.created', 'idea.transition', 'idea.scored',
    'agent.progress', 'gate.passed', 'gate.failed',
  ]

  knownEvents.forEach((eventName) => {
    es.addEventListener(eventName, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        onEvent(eventName, data)
      } catch {
        // ignore parse errors
      }
    })
  })

  es.onerror = (err) => {
    console.error('SSE error:', err)
    onError?.(err)
  }

  return es
}

// ── Per-request Streaming Chat ─────────────────────────────────────────────────

export type StreamEventType =
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

export interface StreamEvent {
  type: StreamEventType
  content?: string
  agent?: string
  speaker?: string
  role?: string
  tool?: string
  params?: Record<string, any>
  output?: any
  action?: string
  from_agent?: string
  to_agent?: string
  interrupt_id?: string
  decision?: 'approve' | 'edit' | 'reject' | 'retry'
  reason?: string
  provenance?: string
  state?: string
  status?: string
  tasks?: any[]
  completed?: number
  total?: number
}

export async function streamChat(
  ideaId: string | null,
  text: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = ideaId
    ? `${API_BASE}/ideas/${ideaId}/chat/stream`
    : `${API_BASE}/chat/stream`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sender: 'user' }),
    signal,
  })

  if (!res.ok) {
    throw new Error(`Stream API ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6)
        if (!raw) continue
        try {
          const evt = JSON.parse(raw) as StreamEvent
          onEvent(evt)
        } catch {
          // ignore malformed
        }
      }
    }
  }
}
