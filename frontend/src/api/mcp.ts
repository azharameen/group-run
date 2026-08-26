import { request } from './request';

export interface MCPServer {
  name: string;
  transport: string;
  url: string;
  timeout: number;
  options?: Record<string, unknown>;
}

export interface MCPServerStatus {
  name: string;
  transport: string;
  status: 'connected' | 'disconnected' | 'degraded' | 'unknown' | 'error';
  latency_ms: number | null;
  error: string | null;
}

export interface MCPServersResponse {
  servers: MCPServer[];
  count: number;
}

export async function fetchMCPServers(): Promise<MCPServer[]> {
  const data = await request<MCPServersResponse>('/mcp/servers/');
  return data.servers;
}

export async function addMCPServer(name: string, url: string, timeout: number = 10): Promise<MCPServer> {
  return request<MCPServer>('/mcp/servers/', {
    method: 'POST',
    body: JSON.stringify({ name, url, timeout }),
  });
}

export async function removeMCPServer(name: string): Promise<void> {
  if (!name.trim()) throw new Error('Server name is required');
  await request<void>(`/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function pingMCPServer(name: string): Promise<MCPServerStatus> {
  return request<MCPServerStatus>(`/mcp/servers/${encodeURIComponent(name)}/health`, {
    method: 'POST',
  });
}
