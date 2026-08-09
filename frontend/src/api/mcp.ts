const API_BASE = '/api';

export interface MCPServer {
  name: string;
  transport: string;
  url: string;
  timeout: number;
}

export interface MCPServersResponse {
  servers: MCPServer[];
  count: number;
}

export async function fetchMCPServers(): Promise<MCPServer[]> {
  const res = await fetch(`${API_BASE}/mcp/servers/`);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch MCP servers: ${res.status} ${error}`);
  }
  const data: MCPServersResponse = await res.json().catch(() => { throw new Error('Invalid JSON response from server'); });
  return data.servers;
}

export async function addMCPServer(name: string, url: string, timeout: number = 10): Promise<MCPServer> {
  const res = await fetch(`${API_BASE}/mcp/servers/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url, timeout }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Failed to add MCP server: ${res.status}`);
  }
  return res.json().catch(() => { throw new Error('Invalid JSON response from server'); });
}

export async function removeMCPServer(name: string): Promise<void> {
  if (!name.trim()) throw new Error('Server name is required');
  const res = await fetch(`${API_BASE}/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Failed to remove MCP server: ${res.status}`);
  }
}
