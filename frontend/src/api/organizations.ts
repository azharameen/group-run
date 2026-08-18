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

export type OrgStatus = 'active' | 'idle' | 'overloaded';

export interface OrgAgent {
  agent_id: string;
  name: string;
  role: string;
  status: OrgStatus;
}

export interface OrgTeam {
  team_id: string;
  name: string;
  status: OrgStatus;
  captain: OrgAgent;
  agents: OrgAgent[];
  active_agents: number;
  total_agents: number;
}

export interface OrgDepartment {
  department_id: string;
  name: string;
  status: OrgStatus;
  chief: OrgAgent;
  teams: OrgTeam[];
}

export interface Organization {
  org_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  chief_of_staff: OrgAgent;
  departments: OrgDepartment[];
}

export interface OrganizationSummary {
  org_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  department_count: number;
  team_count: number;
  agent_count: number;
}

export async function createOrganization(
  name: string,
  description: string,
): Promise<Organization> {
  const data = await request<{ organization: Organization }>('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  return data.organization;
}

export async function fetchOrganizations(): Promise<OrganizationSummary[]> {
  const data = await request<{ organizations: OrganizationSummary[]; count: number }>(
    '/organizations',
  );
  return data.organizations;
}

export async function fetchOrganization(orgId: string): Promise<Organization> {
  const data = await request<{ organization: Organization }>(
    `/organizations/${encodeURIComponent(orgId)}`,
  );
  return data.organization;
}
