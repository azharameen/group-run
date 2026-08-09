const API_BASE = '/api';

export interface AgentDefinition {
  name: string;
  role: string;
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
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch team configuration: ${res.status} ${error}`);
  }
  const data: TeamConfigResponse = await res.json().catch(() => { throw new Error('Invalid JSON response from server'); });
  
  if (data.schema_version !== EXPECTED_SCHEMA_VERSION) {
    console.warn(`Teams schema version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${data.schema_version}`);
  }
  
  return data;
}

export async function reloadTeamsConfig(): Promise<ConfigReloadResponse> {
  const res = await fetch(`${API_BASE}/config/reload`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Failed to reload configuration: ${res.status}`);
  }
  return res.json().catch(() => { throw new Error('Invalid JSON response from server'); });
}
