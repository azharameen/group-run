import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeamHealthTab from '@/components/command-center/TeamHealthTab';
import * as apiClient from '@/api/client';
import type { OrganizationHealth } from '@/api/client';

vi.mock('@/api/client', () => ({
  fetchOrganizations: vi.fn(),
  fetchOrganizationHealth: vi.fn(),
}));

const mockFetchOrganizations = vi.mocked(apiClient.fetchOrganizations);
const mockFetchHealth = vi.mocked(apiClient.fetchOrganizationHealth);

function makeHealth(overrides: Partial<OrganizationHealth> = {}): OrganizationHealth {
  return {
    org_id: 'org-1',
    name: 'Acme',
    total_open_work_items: 3,
    departments: [
      {
        department_id: 'technology',
        name: 'Technology',
        teams: [
          {
            team_id: 'development-team',
            name: 'Development Team',
            department_id: 'technology',
            active_agents: 1,
            idle_agents: 2,
            total_agents: 3,
            open_work_items: 6,
            workload_state: 'overloaded',
          },
          {
            team_id: 'testing-team',
            name: 'Testing Team',
            department_id: 'technology',
            active_agents: 0,
            idle_agents: 3,
            total_agents: 3,
            open_work_items: 0,
            workload_state: 'idle',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('TeamHealthTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchOrganizations.mockResolvedValue([
      {
        org_id: 'org-1',
        name: 'Acme',
        description: '',
        created_at: '',
        updated_at: '',
        department_count: 1,
        team_count: 2,
        agent_count: 6,
      },
    ]);
  });

  test('renders team cards with capacity counts', async () => {
    mockFetchHealth.mockResolvedValue(makeHealth());

    render(<TeamHealthTab />);

    const card = await screen.findByTestId('team-health-card-development-team');
    expect(card).toHaveTextContent('Development Team');
    expect(card).toHaveTextContent('1 active / 2 idle of 3 agents');
    expect(card).toHaveTextContent('6 open work items');
    expect(screen.getByTestId('team-health-card-testing-team')).toBeInTheDocument();
  });

  test('highlights overloaded and idle teams', async () => {
    mockFetchHealth.mockResolvedValue(makeHealth());

    render(<TeamHealthTab />);

    const overloaded = await screen.findByTestId('team-health-state-development-team');
    expect(overloaded).toHaveTextContent('overloaded');
    expect(overloaded.className).toContain('red');
    const idle = screen.getByTestId('team-health-state-testing-team');
    expect(idle).toHaveTextContent('idle');
    expect(idle.className).toContain('emerald');
  });

  test('surfaces API error with retry', async () => {
    mockFetchHealth.mockRejectedValue(new Error('boom'));

    render(<TeamHealthTab />);

    const error = await screen.findByTestId('team-health-error');
    expect(error).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('shows empty state when no organization exists', async () => {
    mockFetchOrganizations.mockResolvedValue([]);

    render(<TeamHealthTab />);

    await waitFor(() => {
      expect(screen.getByTestId('team-health-empty')).toBeInTheDocument();
    });
    expect(mockFetchHealth).not.toHaveBeenCalled();
  });
});
