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
  created_at: string;
  updated_at: string;
}

export interface IdeaDetail {
  idea: Record<string, any>;
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

export async function fetchIdeas(): Promise<IdeaListItem[]> {
  const data = await request<{ ideas: IdeaListItem[] }>(`/ideas`);
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

export async function createIdea(signalText: string, title?: string): Promise<{ idea_id: string; message: string }> {
  return request('/ideas', {
    method: 'POST',
    body: JSON.stringify({ signal_text: signalText, title: title || '' }),
  });
}

export async function deleteIdea(ideaId: string): Promise<{ idea_id: string; deleted: boolean; interrupt_pending?: boolean; message?: string }> {
  return request(`/ideas/${ideaId}`, { method: 'DELETE' });
}

export async function addIdeaComment(ideaId: string, text: string, author = 'User'): Promise<any> {
  return request(`/ideas/${ideaId}/comment`, {
    method: 'POST',
    body: JSON.stringify({ author, text }),
  });
}

export async function updateIdea(ideaId: string, field: string, value: any): Promise<any> {
  return request(`/ideas/${ideaId}/update`, {
    method: 'POST',
    body: JSON.stringify({ field, value }),
  });
}

