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
  created_at: string
  updated_at: string
}

export interface IdeaDetail {
  idea: Record<string, any>
  state: Record<string, any>
  scores: Record<string, any>
}

export interface ScoreResult {
  composite: number
  breakdown: Record<string, number>
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

export async function fetchIdeaDetail(ideaId: string): Promise<IdeaDetail> {
  return request<IdeaDetail>(`/ideas/${ideaId}`)
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

export async function submitPipeline(inputText: string = '', maxIdeas: number = 3): Promise<any> {
  return request('/submit-pipeline', {
    method: 'POST',
    body: JSON.stringify({ input_text: inputText, max_ideas: maxIdeas }),
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
