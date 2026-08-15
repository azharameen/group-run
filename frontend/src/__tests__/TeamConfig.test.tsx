import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamConfig } from '@/components/TeamConfig';
import * as configApi from '@/api/config';

// Mock API
vi.mock('@/api/config', () => ({
  fetchTeamsConfig: vi.fn(),
  reloadTeamsConfig: vi.fn(),
}));

// Mock shadcn components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={`button-${variant || 'default'}`}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: { children?: ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: ReactNode; className?: string }) => <div data-testid="card" className={className}>{children}</div>,
  CardHeader: ({ children, className }: { children?: ReactNode; className?: string }) => <div data-testid="card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children?: ReactNode; className?: string }) => <div data-testid="card-title" className={className}>{children}</div>,
  CardDescription: ({ children }: { children?: ReactNode }) => <div data-testid="card-description">{children}</div>,
  CardContent: ({ children, className }: { children?: ReactNode; className?: string }) => <div data-testid="card-content" className={className}>{children}</div>,
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children?: ReactNode }) => <table data-testid="table">{children}</table>,
  TableHeader: ({ children }: { children?: ReactNode }) => <thead data-testid="table-header">{children}</thead>,
  TableBody: ({ children }: { children?: ReactNode }) => <tbody data-testid="table-body">{children}</tbody>,
  TableRow: ({ children, className }: { children?: ReactNode; className?: string }) => <tr data-testid="table-row" className={className}>{children}</tr>,
  TableHead: ({ children, className }: { children?: ReactNode; className?: string }) => <th data-testid="table-head" className={className}>{children}</th>,
  TableCell: ({ children, className }: { children?: ReactNode; className?: string }) => <td data-testid="table-cell" className={className}>{children}</td>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockConfig: configApi.TeamConfigResponse = {
  schema_version: '1.0',
  teams: {
    'general': {
      name: 'General Team',
      description: 'The general purpose team',
      agents: [
        { name: 'Agent-1', role: 'Support' },
        { name: 'Agent-2', role: 'Research' }
      ],
      routing_keys: ['key-1', 'key-2']
    },
    'dev': {
      name: 'Development Team',
      description: 'Software development team',
      agents: [
        { name: 'Dev-Agent', role: 'Developer' }
      ],
      routing_keys: ['dev-key']
    }
  }
};

describe('TeamConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configApi.fetchTeamsConfig).mockResolvedValue(mockConfig);
  });

  test('renders team configuration after loading', async () => {
    render(<TeamConfig />);
    
    expect(screen.getByText(/Loading configuration.../i)).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('General Team')).toBeDefined();
      expect(screen.getByText('Development Team')).toBeDefined();
    });
    
    expect(screen.getByText('Schema Version: 1.0')).toBeDefined();
    expect(screen.getByText('key-1')).toBeDefined();
    expect(screen.getByText('dev-key')).toBeDefined();
    expect(screen.getByText('Agent-1')).toBeDefined();
    expect(screen.getByText('Dev-Agent')).toBeDefined();
  });

  test('shows empty state when no teams defined', async () => {
    vi.mocked(configApi.fetchTeamsConfig).mockResolvedValue({ schema_version: '1.0', teams: {} });
    render(<TeamConfig />);
    
    await waitFor(() => {
      expect(screen.getByText(/No teams defined in teams.yaml/i)).toBeDefined();
    });
  });

  test('handles load error', async () => {
    const errorMsg = 'Failed to load config';
    vi.mocked(configApi.fetchTeamsConfig).mockRejectedValue(new Error(errorMsg));
    render(<TeamConfig />);
    
    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeDefined();
    });
  });

  test('triggers reload successfully', async () => {
    vi.mocked(configApi.reloadTeamsConfig).mockResolvedValue({
      teams: ['general', 'dev'],
      count: 2,
      message: 'Teams config reloaded successfully'
    });

    render(<TeamConfig />);
    
    await waitFor(() => {
      expect(screen.getByText('General Team')).toBeDefined();
    });

    const reloadButton = screen.getByText(/Reload Config/i);
    fireEvent.click(reloadButton);

    await waitFor(() => {
      expect(configApi.reloadTeamsConfig).toHaveBeenCalled();
      expect(configApi.fetchTeamsConfig).toHaveBeenCalledTimes(2); // Initial + after reload
    });
  });

  test('handles reload error', async () => {
    vi.mocked(configApi.reloadTeamsConfig).mockRejectedValue(new Error('Invalid YAML'));

    render(<TeamConfig />);
    
    await waitFor(() => {
      expect(screen.getByText('General Team')).toBeDefined();
    });

    const reloadButton = screen.getByText(/Reload Config/i);
    fireEvent.click(reloadButton);

    await waitFor(() => {
      expect(configApi.reloadTeamsConfig).toHaveBeenCalled();
    });
    
    // Toast should be called with error (verified via manual check of mock if we had access to the return of useToast)
  });
});
