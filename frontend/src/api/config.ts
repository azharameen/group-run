import { request } from './request';

export interface AgentDefinition {
  name: string;
  role: string;
  description?: string;
}

export interface TeamDefinition {
  name: string;
  description: string;
  agents: AgentDefinition[];
  routing_keys: string[];
}

export interface TeamConfigResponse {
  schema_version: string;
  teams: Record<string, TeamDefinition>;
}

export interface ConfigReloadResponse {
  teams: string[];
  count: number;
  message: string;
}

const EXPECTED_SCHEMA_VERSION = '1.0';

export async function fetchTeamsConfig(): Promise<TeamConfigResponse> {
  const data = await request<TeamConfigResponse>('/config');
  
  if (data.schema_version !== EXPECTED_SCHEMA_VERSION) {
    console.warn(`Teams schema version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${data.schema_version}`);
  }
  
  return data;
}

export async function reloadTeamsConfig(): Promise<ConfigReloadResponse> {
  return request<ConfigReloadResponse>('/config/reload', {
    method: 'POST',
  });
}
