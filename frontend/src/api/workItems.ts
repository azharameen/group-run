import { formatApiError } from './errors';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatApiError(res.status, text));
  }
  return res.json();
}

export type RoutingConfidence = 'high' | 'low';

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

export async function submitWorkItem(payload: SubmitWorkItemPayload): Promise<WorkItem> {
  const data = await request<{ work_item: WorkItem }>('/work-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.work_item;
}

export async function fetchWorkItems(orgId?: string): Promise<WorkItem[]> {
  const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
  const data = await request<{ work_items: WorkItem[]; count: number }>(
    `/work-items${query}`,
  );
  return data.work_items ?? [];
}

export async function fetchWorkItem(workItemId: string): Promise<WorkItem> {
  const data = await request<{ work_item: WorkItem }>(
    `/work-items/${encodeURIComponent(workItemId)}`,
  );
  return data.work_item;
}
