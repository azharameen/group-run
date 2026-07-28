import { InterruptItem } from '../types/deepagents';

const API_BASE = '/api';

export async function fetchPendingInterrupts(ideaId?: string): Promise<InterruptItem[]> {
  const url = ideaId 
    ? `${API_BASE}/workflow/interrupts?idea_id=${ideaId}`
    : `${API_BASE}/workflow/interrupts`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch interrupts: ${res.statusText}`);
  }
  const data = await res.json();
  return data.pending_interrupts || [];
}

export async function approveInterrupt(ideaId: string, reviewer: string, comments: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workflow/${ideaId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer, decision: 'APPROVED', comments })
  });
  if (!res.ok) {
    throw new Error(`Failed to approve interrupt: ${res.statusText}`);
  }
  return res.json();
}

export async function rejectInterrupt(ideaId: string, reviewer: string, comments: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workflow/${ideaId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer, decision: 'REJECTED', comments })
  });
  if (!res.ok) {
    throw new Error(`Failed to reject interrupt: ${res.statusText}`);
  }
  return res.json();
}
