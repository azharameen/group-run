import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchMCPServers,
  addMCPServer,
  removeMCPServer,
  pingMCPServer,
  MCPServer,
  MCPServerStatus,
} from '../api/mcp';

describe('mcp.ts API module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchMCPServers', () => {
    it('fetches MCP servers successfully', async () => {
      const mockServers: MCPServer[] = [
        { name: 'server-1', transport: 'http', url: 'http://localhost:8000', timeout: 10 },
        { name: 'server-2', transport: 'stdio', url: 'http://localhost:8001', timeout: 20 },
      ];

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ servers: mockServers, count: 2 }),
        }),
      );

      const servers = await fetchMCPServers();
      expect(servers).toEqual(mockServers);
      expect(fetch).toHaveBeenCalledWith('/api/mcp/servers/');
    });

    it('throws error on non-ok HTTP response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        }),
      );

      await expect(fetchMCPServers()).rejects.toThrow(
        'Failed to fetch MCP servers: 500 Internal Server Error',
      );
    });

    it('throws error when JSON response is invalid', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('JSON parse error');
          },
        }),
      );

      await expect(fetchMCPServers()).rejects.toThrow('Invalid JSON response from server');
    });

    it('throws error when network or timeout error occurs', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network request timed out')),
      );

      await expect(fetchMCPServers()).rejects.toThrow('Network request timed out');
    });
  });

  describe('addMCPServer', () => {
    it('adds an MCP server with default timeout', async () => {
      const mockServer: MCPServer = {
        name: 'test-server',
        transport: 'http',
        url: 'http://localhost:9000',
        timeout: 10,
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockServer,
        }),
      );

      const result = await addMCPServer('test-server', 'http://localhost:9000');
      expect(result).toEqual(mockServer);
      expect(fetch).toHaveBeenCalledWith('/api/mcp/servers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-server', url: 'http://localhost:9000', timeout: 10 }),
      });
    });

    it('adds an MCP server with custom timeout', async () => {
      const mockServer: MCPServer = {
        name: 'test-server',
        transport: 'http',
        url: 'http://localhost:9000',
        timeout: 25,
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockServer,
        }),
      );

      const result = await addMCPServer('test-server', 'http://localhost:9000', 25);
      expect(result).toEqual(mockServer);
      expect(fetch).toHaveBeenCalledWith('/api/mcp/servers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-server', url: 'http://localhost:9000', timeout: 25 }),
      });
    });

    it('throws error with detail message on non-ok HTTP response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ detail: 'Server name already exists' }),
        }),
      );

      await expect(addMCPServer('test-server', 'http://localhost:9000')).rejects.toThrow(
        'Server name already exists',
      );
    });

    it('throws error with fallback status text on non-ok HTTP response without detail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => {
            throw new Error('Not JSON');
          },
        }),
      );

      await expect(addMCPServer('test-server', 'http://localhost:9000')).rejects.toThrow(
        'Bad Request',
      );
    });

    it('throws error when json parsing fails on success response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        }),
      );

      await expect(addMCPServer('test-server', 'http://localhost:9000')).rejects.toThrow(
        'Invalid JSON response from server',
      );
    });

    it('throws error on network failure or timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Request timeout')),
      );

      await expect(addMCPServer('test-server', 'http://localhost:9000')).rejects.toThrow(
        'Request timeout',
      );
    });
  });

  describe('removeMCPServer', () => {
    it('throws error if server name is empty or whitespace', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      await expect(removeMCPServer('')).rejects.toThrow('Server name is required');
      await expect(removeMCPServer('   ')).rejects.toThrow('Server name is required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('removes MCP server successfully and encodes server name in URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
        }),
      );

      await removeMCPServer('server name/1');
      expect(fetch).toHaveBeenCalledWith('/api/mcp/servers/server%20name%2F1', {
        method: 'DELETE',
      });
    });

    it('throws error with detail message on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: async () => ({ detail: 'Server not found' }),
        }),
      );

      await expect(removeMCPServer('test-server')).rejects.toThrow('Server not found');
    });

    it('throws error with statusText fallback on non-ok response without detail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => {
            throw new Error('Not JSON');
          },
        }),
      );

      await expect(removeMCPServer('test-server')).rejects.toThrow('Internal Server Error');
    });

    it('throws error on network failure or timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error during removal')),
      );

      await expect(removeMCPServer('test-server')).rejects.toThrow('Network error during removal');
    });
  });

  describe('pingMCPServer', () => {
    it('pings MCP server successfully and returns status', async () => {
      const mockStatus: MCPServerStatus = {
        name: 'test-server',
        transport: 'http',
        status: 'connected',
        latency_ms: 12,
        error: null,
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockStatus,
        }),
      );

      const status = await pingMCPServer('server 1/test');
      expect(status).toEqual(mockStatus);
      expect(fetch).toHaveBeenCalledWith('/api/mcp/servers/server%201%2Ftest/health', {
        method: 'POST',
      });
    });

    it('throws error with detail message on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({ detail: 'Service Unavailable' }),
        }),
      );

      await expect(pingMCPServer('test-server')).rejects.toThrow('Service Unavailable');
    });

    it('throws error with statusText fallback when response is non-ok and not JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          json: async () => {
            throw new Error('Not JSON');
          },
        }),
      );

      await expect(pingMCPServer('test-server')).rejects.toThrow('Gateway Timeout');
    });

    it('throws error on network failure or timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Health check timed out')),
      );

      await expect(pingMCPServer('test-server')).rejects.toThrow('Health check timed out');
    });
  });
});
