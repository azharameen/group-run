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
