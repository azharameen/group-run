import { request, RequestOptions } from './request';

export type RoutingConfidence = 'high' | 'low';
export const LIFECYCLE_PHASES = [
  'new', 'ideation', 'product_definition', 'development', 'testing', 'deployment', 'monitoring',
] as const;
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];
export interface LifecycleEvent {
  event_id: string; work_item_id: string;
  event_type: 'created' | 'transition' | 'handoff';
  from_status: string; to_status: string;
  from_department: string; to_department: string;
  decided_by: string; decided_at: string;
  confidence: RoutingConfidence; reasoning: string; alternatives: string[];
}
export interface DecisionRecord {
  decision_id: string; work_item_id: string; agent_id: string;
  decision_type: 'routing' | 'transition' | 'handoff' | 'review';
  reasoning: string; evidence: string[]; confidence: RoutingConfidence;
  alternatives: string[]; decided_at: string;
}
export interface RecordDecisionPayload {
  work_item_id: string; agent_id: string;
  decision_type: DecisionRecord['decision_type']; reasoning: string;
  evidence?: string[]; confidence: RoutingConfidence; alternatives?: string[];
}

export interface RoutingDecision {
  department_id: string;
  decided_by: string;
  decided_at: string;
  confidence: RoutingConfidence;
  reasoning: string;
  alternatives: string[];
}

export interface WorkItem {
  work_item_id: string;
  org_id: string;
  title: string;
  description: string;
  status: string;
  owner_agent_id: string;
  source: string;
  department_id: string;
  routing: RoutingDecision;
  created_at: string;
  updated_at: string;
}

export interface SubmitWorkItemPayload {
  title: string;
  description?: string;
  org_id?: string;
  department?: string;
  source?: string;
}

export async function submitWorkItem(payload: SubmitWorkItemPayload, options?: RequestOptions): Promise<WorkItem> {
  const data = await request<{ work_item: WorkItem }>('/work-items', {
    method: 'POST',
    body: JSON.stringify(payload),
    ...options,
  });
  return data.work_item;
}

export async function fetchWorkItems(orgId?: string, options?: RequestOptions): Promise<WorkItem[]> {
  const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
  const data = await request<{ work_items: WorkItem[]; count: number }>(
    `/work-items${query}`,
    options,
  );
  return data.work_items ?? [];
}

export async function fetchWorkItem(workItemId: string, options?: RequestOptions): Promise<WorkItem> {
  const data = await request<{ work_item: WorkItem }>(
    `/work-items/${encodeURIComponent(workItemId)}`,
    options,
  );
  return data.work_item;
}

export async function transitionWorkItem(
  workItemId: string,
  payload: { status: string; reasoning?: string; decided_by?: string },
): Promise<{ work_item: WorkItem; event: LifecycleEvent }> {
  return request(`/work-items/${encodeURIComponent(workItemId)}/transitions`, {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export async function fetchLifecycleHistory(workItemId: string): Promise<LifecycleEvent[]> {
  const data = await request<{ events: LifecycleEvent[]; count: number }>(
    `/work-items/${encodeURIComponent(workItemId)}/lifecycle`,
  );
  return data.events ?? [];
}

export async function listDecisions(params: {
  work_item_id?: string; agent_id?: string; from?: string; to?: string;
} = {}, options?: RequestOptions): Promise<DecisionRecord[]> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, value); });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await request<{ decisions: DecisionRecord[]; count: number }>(
    `/work-items/decisions${suffix}`, options,
  );
  return data.decisions ?? [];
}

export async function createDecision(
  body: RecordDecisionPayload, options?: RequestOptions,
): Promise<DecisionRecord> {
  const data = await request<{ decision: DecisionRecord }>('/work-items/decisions', {
    method: 'POST', body: JSON.stringify(body), ...options,
  });
  return data.decision;
}

export interface AccuracyReview {
  review_id: string; work_item_id: string; reviewer: string;
  accuracy_score: number; summary: string; flagged_for_review: boolean;
  reviewed_at: string;
}

export interface CreateReviewPayload {
  reviewer?: string; accuracy_score: number; summary: string;
}

export async function listReviews(workItemId: string, options?: RequestOptions): Promise<AccuracyReview[]> {
  const data = await request<{ reviews: AccuracyReview[]; count: number }>(
    `/work-items/${encodeURIComponent(workItemId)}/reviews`, options,
  );
  return data.reviews ?? [];
}

export async function createReview(
  workItemId: string, body: CreateReviewPayload, options?: RequestOptions,
): Promise<AccuracyReview> {
  const data = await request<{ review: AccuracyReview }>(
    `/work-items/${encodeURIComponent(workItemId)}/reviews`, {
      method: 'POST', body: JSON.stringify(body), ...options,
    },
  );
  return data.review;
}
