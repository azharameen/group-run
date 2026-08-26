import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchTeamsConfig,
  reloadTeamsConfig,
  TeamConfigResponse,
  ConfigReloadResponse,
} from '../api/config';

describe('config.ts API module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchTeamsConfig', () => {
    it('fetches teams config successfully with matching schema version', async () => {
      const mockConfig: TeamConfigResponse = {
        schema_version: '1.0',
        teams: {
          triage: {
            name: 'triage',
            description: 'Triage team',
            agents: [{ name: 'agent1', role: 'role1' }],
            routing_keys: ['key1'],
          },
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockConfig,
        }),
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await fetchTeamsConfig();
      expect(result).toEqual(mockConfig);
      expect(fetch).toHaveBeenCalledWith('/api/config', expect.any(Object));
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logs warning when schema version mismatches expected version', async () => {
      const mockConfig: TeamConfigResponse = {
        schema_version: '2.0',
        teams: {},
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockConfig,
        }),
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await fetchTeamsConfig();
      expect(result).toEqual(mockConfig);
      expect(warnSpy).toHaveBeenCalledWith(
        'Teams schema version mismatch: expected 1.0, got 2.0',
      );
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

      await expect(fetchTeamsConfig()).rejects.toThrow(
        'API 500: Internal Server Error',
      );
    });

    it('throws error when JSON response is invalid', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('SyntaxError: Unexpected token');
          },
        }),
      );

      await expect(fetchTeamsConfig()).rejects.toThrow('Invalid JSON response from server');
    });

    it('throws error when network failure or request timeout occurs', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network request timed out')),
      );

      await expect(fetchTeamsConfig()).rejects.toThrow('Network request timed out');
    });
  });

  describe('reloadTeamsConfig', () => {
    it('reloads teams config successfully', async () => {
      const mockReloadResponse: ConfigReloadResponse = {
        teams: ['triage', 'research'],
        count: 2,
        message: 'Successfully reloaded configuration',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockReloadResponse,
        }),
      );

      const result = await reloadTeamsConfig();
      expect(result).toEqual(mockReloadResponse);
      expect(fetch).toHaveBeenCalledWith('/api/config/reload', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('throws error with detail message on non-ok HTTP response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ detail: 'Failed to parse configuration file' }),
        }),
      );

      await expect(reloadTeamsConfig()).rejects.toThrow('Failed to parse configuration file');
    });

    it('throws error with fallback message when non-ok response lacks detail and json fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Error',
          json: async () => {
            throw new Error('Not JSON');
          },
        }),
      );

      await expect(reloadTeamsConfig()).rejects.toThrow(
        'API 500',
      );
    });

    it('throws error with status fallback when non-ok response JSON has no detail and statusText is empty', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: '',
          json: async () => ({}),
        }),
      );

      await expect(reloadTeamsConfig()).rejects.toThrow(
        'API 503',
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

      await expect(reloadTeamsConfig()).rejects.toThrow('Invalid JSON response from server');
    });

    it('throws error on network failure or timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Request timeout')),
      );

      await expect(reloadTeamsConfig()).rejects.toThrow('Request timeout');
    });
  });
});
