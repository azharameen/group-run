import { describe, test, expect, vi, beforeEach } from 'vitest';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Organization from '@/pages/Organization';
import * as orgApi from '@/api/organizations';
import type {
  OrgAgent,
  OrgTeam,
  Organization as Org,
  OrganizationSummary,
} from '@/api/organizations';

// Mock the organizations API (the page reaches it via the @/api/client barrel,
// which re-exports this same module — vitest resolves both to one registry entry).
vi.mock('@/api/organizations', () => ({
  fetchOrganizations: vi.fn(),
  fetchOrganization: vi.fn(),
  createOrganization: vi.fn(),
}));

// Mock shadcn components
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, ...rest }: { children?: ReactNode; variant?: string } & HTMLAttributes<HTMLSpanElement>) => (
    <span data-testid="badge" data-variant={variant} {...rest}>
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, variant, size, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button data-testid="button" data-variant={variant} data-size={size} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children, ...rest }: HTMLAttributes<HTMLElement>) => <div data-testid="card-header" {...rest}>{children}</div>,
  CardContent: ({ children, ...rest }: HTMLAttributes<HTMLElement>) => <div data-testid="card-content" {...rest}>{children}</div>,
  CardTitle: ({ children, ...rest }: HTMLAttributes<HTMLElement>) => <div data-testid="card-title" {...rest}>{children}</div>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="input" value={value} onChange={(e) => onChange?.(e)} {...rest} />
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea data-testid="textarea" value={value} onChange={(e) => onChange?.(e)} {...rest} />
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const agent = (agentId: string, name: string, role: string, status: 'active' | 'idle' = 'idle'): OrgAgent => ({
  agent_id: agentId,
  name,
  role,
  status,
});

const makeTeam = (teamId: string, name: string): OrgTeam => ({
  team_id: teamId,
  name,
  status: 'idle',
  captain: agent(`${teamId}_captain`, `${name} Captain`, 'team_captain'),
  agents: [
    agent(`${teamId}_captain`, `${name} Captain`, 'team_captain'),
    agent(`${teamId}_specialist`, `${name} Specialist`, 'specialist'),
    agent(`${teamId}_specialist2`, `${name} Specialist Two`, 'specialist'),
  ],
  active_agents: 0,
  total_agents: 3,
});

const makeOrganization = (overrides: Partial<Org> = {}): Org => ({
  org_id: 'org-1',
  name: 'Acme AI',
  description: 'Test organization',
  created_at: '2026-08-17T00:00:00',
  updated_at: '2026-08-17T00:00:00',
  chief_of_staff: agent('chief_of_staff', 'Chief of Staff', 'chief_of_staff', 'active'),
  departments: [
    {
      department_id: 'ideation',
      name: 'Ideation',
      status: 'active',
      chief: agent('chief_ideation', 'Chief of Ideation', 'department_chief'),
      teams: [makeTeam('idea-team', 'Idea Team'), makeTeam('product-team', 'Product Team')],
    },
    {
      department_id: 'technology',
      name: 'Technology',
      status: 'active',
      chief: agent('chief_technology', 'Chief of Technology', 'department_chief'),
      teams: [
        makeTeam('development-team', 'Development Team'),
        makeTeam('testing-team', 'Testing Team'),
        makeTeam('devops-team', 'DevOps Team'),
      ],
    },
  ],
  ...overrides,
});

const summary: OrganizationSummary = {
  org_id: 'org-1',
  name: 'Acme AI',
  description: '',
  created_at: '2026-08-17T00:00:00',
  updated_at: '2026-08-17T00:00:00',
  department_count: 2,
  team_count: 5,
  agent_count: 18,
};

describe('Organization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([]);
  });

  test('shows the create form when no organizations exist', async () => {
    render(<Organization />);
    await waitFor(() => {
      expect(screen.getByTestId('org-empty-state')).toBeInTheDocument();
    });
    expect(screen.getByTestId('org-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('org-description-input')).toBeInTheDocument();
    expect(screen.getByTestId('org-create-button')).toBeInTheDocument();
  });

  test('shows inline validation when creating with a blank name', async () => {
    render(<Organization />);
    await waitFor(() => {
      expect(screen.getByTestId('org-create-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('org-create-button'));
    expect(screen.getByTestId('org-name-error')).toBeInTheDocument();
    expect(orgApi.createOrganization).not.toHaveBeenCalled();
  });

  test('creates an organization and renders the tree on success', async () => {
    vi.mocked(orgApi.createOrganization).mockResolvedValue(makeOrganization());

    render(<Organization />);
    await waitFor(() => {
      expect(screen.getByTestId('org-create-button')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('org-name-input'), { target: { value: '  Acme AI  ' } });
    fireEvent.change(screen.getByTestId('org-description-input'), { target: { value: 'Test org' } });
    fireEvent.click(screen.getByTestId('org-create-button'));

    await waitFor(() => {
      expect(orgApi.createOrganization).toHaveBeenCalledWith('Acme AI', 'Test org');
    });
    await waitFor(() => {
      expect(screen.getByTestId('org-name')).toHaveTextContent('Acme AI');
    });
    expect(screen.queryByTestId('org-empty-state')).not.toBeInTheDocument();
  });

  test('renders the populated organization tree', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([summary]);
    vi.mocked(orgApi.fetchOrganization).mockResolvedValue(makeOrganization());

    render(<Organization />);

    await waitFor(() => {
      expect(screen.getByTestId('org-name')).toHaveTextContent('Acme AI');
    });

    expect(orgApi.fetchOrganization).toHaveBeenCalledWith('org-1');
    expect(screen.getByTestId('org-cos-status')).toHaveTextContent('active');

    const deptNames = screen.getAllByTestId('org-dept-name').map((el) => el.textContent);
    expect(deptNames).toEqual(['Ideation', 'Technology']);

    const teamNames = screen.getAllByTestId('org-team-name').map((el) => el.textContent);
    expect(teamNames).toEqual(['Idea Team', 'Product Team', 'Development Team', 'Testing Team', 'DevOps Team']);

    const capacities = screen.getAllByTestId('org-team-capacity').map((el) => el.textContent);
    expect(capacities).toHaveLength(5);
    expect(capacities[0]).toContain('0/3');
  });

  test('shows the error state when the organization fetch fails', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([summary]);
    vi.mocked(orgApi.fetchOrganization).mockRejectedValue(new Error('API 404: Organization gone not found'));

    render(<Organization />);

    await waitFor(() => {
      expect(screen.getByTestId('org-error-state')).toBeInTheDocument();
    });
    expect(screen.getByTestId('org-error-state')).toHaveTextContent('not found');
  });
});
