import { request, RequestOptions } from './request';
import type { ProductDefinitionStatus } from './workItems';

export interface IdeaListItem {
  idea_id: string;
  work_item_id?: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaData {
  idea_id: string;
  work_item_id?: string;
  title: string;
  signal_text?: string;
  problem_statement?: string;
  solution_concept?: string;
  source_evidence?: string[];
  created_at?: string;
  updated_at?: string;
  research?: {
    state: string;
    artifact_names?: string[];
    expected_artifacts?: string[];
    completed_artifacts?: string[];
    error?: string;
    updated_at?: number;
  };
  validation?: ValidationStatus;
  product_definition?: ProductDefinitionStatus | null;
  [key: string]: unknown;
}

export type PatentabilityOutcome = 'likely' | 'uncertain' | 'unlikely';
export type FtoRisk = 'low' | 'moderate' | 'high' | 'unknown';
export type ValidationState = 'unknown' | 'initializing' | 'running' | 'completed' | 'failed' | 'incomplete' | 'cancelled';

export interface NoveltyAssessmentSummary {
  novelty_score: number;
  patentability_score: number;
  patentability_outcome: PatentabilityOutcome;
  fto_risk: FtoRisk;
  fto_analysis: string;
  confidence: number;
  rationale: string;
  prior_art_refs: string[];
  source_refs: string[];
  provenance: string;
  agent_id: string;
  assessed_at: string;
  artifact_name: string;
  artifact_version?: number | null;
}

export interface ValidationStatus {
  state: ValidationState;
  idea_id: string;
  work_item_id?: string | null;
  expected_artifacts?: string[];
  completed_artifacts?: string[];
  error?: string;
  retryable?: boolean | null;
  updated_at?: number;
  summary?: NoveltyAssessmentSummary | null;
  artifact?: Record<string, unknown>;
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
  agent_id?: string;
  trust: string;
  evidence_refs: string[];
}

export interface MaturityRecord {
  stage: string;
  criteria: string[];
  evidence_refs: string[];
  recorded_by: string;
  recorded_at: string;
}

export interface IdeaMaturity {
  idea_id: string;
  stage: string;
  current: MaturityRecord | null;
  history: MaturityRecord[];
  next_stage: string | null;
  stage_criteria: Record<string, string[]>;
}

export async function fetchIdeaMaturity(ideaId: string, options?: RequestOptions): Promise<IdeaMaturity> {
  return request<IdeaMaturity>(`/ideas/${ideaId}/maturity`, options);
}

export async function recordIdeaMaturity(
  ideaId: string,
  body: { stage: string; criteria: string[]; evidence_refs: string[]; recorded_by: string },
  options?: RequestOptions,
): Promise<{ idea_id: string; stage: string; record: MaturityRecord }> {
  return request(`/ideas/${ideaId}/maturity`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options,
  });
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

export async function fetchIdeaValidation(
  ideaId: string,
  options?: RequestOptions,
): Promise<ValidationStatus> {
  const res = await request<{ idea_id: string; validation: ValidationStatus }>(
    `/ideas/${encodeURIComponent(ideaId)}/validation`,
    options,
  );
  return res.validation;
}

export async function fetchIdeaProductDefinition(
  ideaId: string,
  options?: RequestOptions,
): Promise<ProductDefinitionStatus | null> {
  const detail = await fetchIdeaDetail(ideaId, options);
  return detail.idea.product_definition ?? null;
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
