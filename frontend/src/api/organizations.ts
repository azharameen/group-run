import { request, RequestOptions } from './request';

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
  options?: RequestOptions,
): Promise<Organization> {
  const data = await request<{ organization: Organization }>('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
    ...options,
  });
  return data.organization;
}

export async function fetchOrganizations(options?: RequestOptions): Promise<OrganizationSummary[]> {
  const data = await request<{ organizations: OrganizationSummary[]; count: number }>(
    '/organizations',
    options,
  );
  return data.organizations;
}

export async function fetchOrganization(orgId: string, options?: RequestOptions): Promise<Organization> {
  const data = await request<{ organization: Organization }>(
    `/organizations/${encodeURIComponent(orgId)}`,
    options,
  );
  return data.organization;
}
