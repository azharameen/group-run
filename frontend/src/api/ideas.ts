const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface IdeaListItem {
  idea_id: string;
  title: string;
  phase: string;
  state: string;
  composite_score: number;
  strength_rating: string;
  running_agent: string;
  active_processing?: boolean;
  paused_processing?: boolean;
  active_agent?: string;
  active_state?: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaDetail {
  idea: Record<string, any>;
  state: Record<string, any>;
  scores: Record<string, any>;
  comments?: Array<{
    author: string;
    text: string;
    timestamp: string;
  }>;
  transcript_events?: Array<Record<string, any>>;
  transcript?: Array<Record<string, any>>;
}

export interface IdeaFile {
  path: string;
  filename: string;
  ext: string;
  size_bytes: number;
  modified_at: string;
  content: string;
}

export interface ArtifactRevision {
  artifact_name: string;
  version: number;
  timestamp: string;
  path: string;
  file_name: string;
  content: string;
  diff: string;
  provenance: string;
  trust: string;
  evidence_refs: string[];
}

export interface CriterionDetail {
  score: number;
  reasoning: string;
  confidence: number;
}

export interface ScoreResult {
  composite: number;
  breakdown: Record<string, number>;
  criteria_detail: Record<string, CriterionDetail>;
  summary: string;
  change_explanation: string;
  strength_rating: string;
  meets_threshold: boolean;
  threshold_reason: string;
}

export async function fetchIdeas(params?: { phase?: string; state?: string; min_score?: number }): Promise<IdeaListItem[]> {
  const query = new URLSearchParams();
  if (params?.phase) query.set('phase', params.phase);
  if (params?.state) query.set('state', params.state);
  if (params?.min_score !== undefined) query.set('min_score', String(params.min_score));
  const qs = query.toString();
  const data = await request<{ ideas: IdeaListItem[] }>(`/ideas${qs ? `?${qs}` : ''}`);
  return data.ideas;
}

export async function fetchIdeaDetail(ideaId: string): Promise<IdeaDetail> {
  return request<IdeaDetail>(`/ideas/${ideaId}`);
}

export async function fetchIdeaFiles(ideaId: string): Promise<IdeaFile[]> {
  const res = await request<{ idea_id: string; files: IdeaFile[] }>(`/ideas/${ideaId}/files`);
  return res.files || [];
}

export async function fetchIdeaRevisions(ideaId: string): Promise<ArtifactRevision[]> {
  const res = await request<{ idea_id: string; revisions: ArtifactRevision[] }>(`/ideas/${ideaId}/revisions`);
  return res.revisions || [];
}

export async function fetchArtifactDiff(ideaId: string, artifactName: string): Promise<any> {
  return request(`/ideas/${ideaId}/artifacts/${encodeURIComponent(artifactName)}/diff`);
}

export async function createIdea(signalText: string, title?: string): Promise<{ idea_id: string; score: ScoreResult }> {
  return request('/ideas', {
    method: 'POST',
    body: JSON.stringify({ signal_text: signalText, title: title || '' }),
  });
}

export async function advanceIdea(ideaId: string, targetState?: string): Promise<any> {
  return request(`/ideas/${ideaId}/advance`, {
    method: 'POST',
    body: JSON.stringify({ target_state: targetState }),
  });
}

export async function scoreIdea(ideaId: string): Promise<ScoreResult> {
  return request(`/ideas/${ideaId}/score`, { method: 'POST' });
}

export async function deleteIdea(ideaId: string): Promise<{ idea_id: string; deleted: boolean; interrupt_pending?: boolean; message?: string }> {
  return request(`/ideas/${ideaId}`, { method: 'DELETE' });
}

export async function pauseIdea(ideaId: string): Promise<{ idea_id: string; paused_processing: boolean }> {
  return request(`/ideas/${ideaId}/pause`, { method: 'POST' });
}

export async function resumeIdea(ideaId: string): Promise<{ idea_id: string; paused_processing: boolean }> {
  return request(`/ideas/${ideaId}/resume`, { method: 'POST' });
}

export async function addIdeaComment(ideaId: string, text: string, author = 'User'): Promise<any> {
  return request(`/ideas/${ideaId}/comment`, {
    method: 'POST',
    body: JSON.stringify({ author, text }),
  });
}

export async function validateGate(ideaId: string, gateName: string): Promise<any> {
  return request(`/ideas/${ideaId}/validate-gate`, {
    method: 'POST',
    body: JSON.stringify({ gate_name: gateName }),
  });
}

export async function updateIdea(ideaId: string, field: string, value: any): Promise<any> {
  return request(`/ideas/${ideaId}/update`, {
    method: 'POST',
    body: JSON.stringify({ field, value }),
  });
}

export async function addEvidence(ideaId: string, source: string, content: string): Promise<any> {
  return request(`/ideas/${ideaId}/evidence`, {
    method: 'POST',
    body: JSON.stringify({ source, content }),
  });
}
