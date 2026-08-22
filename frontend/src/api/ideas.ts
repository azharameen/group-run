import { request, RequestOptions } from './request';

export interface IdeaListItem {
  idea_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaData {
  idea_id: string;
  title: string;
  signal_text?: string;
  problem_statement?: string;
  solution_concept?: string;
  source_evidence?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface IdeaDetail {
  idea: IdeaData;
  comments?: Array<{
    author: string;
    text: string;
    timestamp: string;
  }>;
  transcript_events?: Array<Record<string, unknown>>;
  transcript?: Array<Record<string, unknown>>;
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
  agent_id: string;
  trust: string;
  evidence_refs: string[];
}

export async function fetchIdeas(options?: RequestOptions): Promise<IdeaListItem[]> {
  const data = await request<{ ideas: IdeaListItem[] }>(`/ideas`, options);
  return data.ideas;
}

export async function fetchIdeaDetail(ideaId: string, options?: RequestOptions): Promise<IdeaDetail> {
  return request<IdeaDetail>(`/ideas/${ideaId}`, options);
}

export async function fetchIdeaFiles(ideaId: string, options?: RequestOptions): Promise<IdeaFile[]> {
  const res = await request<{ idea_id: string; files: IdeaFile[] }>(`/ideas/${ideaId}/files`, options);
  return res.files || [];
}

export async function fetchIdeaRevisions(ideaId: string, options?: RequestOptions): Promise<ArtifactRevision[]> {
  const res = await request<{ idea_id: string; revisions: ArtifactRevision[] }>(`/ideas/${ideaId}/revisions`, options);
  return res.revisions || [];
}

export async function fetchArtifactDiff(ideaId: string, artifactName: string, options?: RequestOptions): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/ideas/${ideaId}/artifacts/${encodeURIComponent(artifactName)}/diff`, options);
}

export async function recordIdeaReview(
  ideaId: string,
  body: { reviewer_role: string; decision: string; comments?: string },
  options?: RequestOptions,
): Promise<{ idea_id: string; reviewer: string; decision: string }> {
  return request(`/ideas/${ideaId}/review`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options,
  });
}

export async function createIdea(signalText: string, title?: string, options?: RequestOptions): Promise<{ idea_id: string; message: string }> {
  return request('/ideas', {
    method: 'POST',
    body: JSON.stringify({ signal_text: signalText, title: title || '' }),
    ...options,
  });
}

export async function deleteIdea(ideaId: string, options?: RequestOptions): Promise<{ idea_id: string; deleted: boolean; interrupt_pending?: boolean; message?: string }> {
  return request(`/ideas/${ideaId}`, { method: 'DELETE', ...options });
}

export async function addIdeaComment(
  ideaId: string,
  text: string,
  author = 'User',
  options?: RequestOptions,
): Promise<{ idea_id: string; comment: { author: string; text: string; timestamp: string } }> {
  return request(`/ideas/${ideaId}/comment`, {
    method: 'POST',
    body: JSON.stringify({ author, text }),
    ...options,
  });
}

export async function updateIdea(ideaId: string, field: string, value: unknown, options?: RequestOptions): Promise<{ idea_id: string; field: string; updated: boolean }> {
  return request(`/ideas/${ideaId}/update`, {
    method: 'POST',
    body: JSON.stringify({ field, value }),
    ...options,
  });
}
