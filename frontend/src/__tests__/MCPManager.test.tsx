import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MCPManager } from '@/components/MCPManager';
import * as mcpApi from '@/api/mcp';

// Mock API
vi.mock('@/api/mcp', () => ({
  fetchMCPServers: vi.fn(),
  addMCPServer: vi.fn(),
  removeMCPServer: vi.fn(),
}));

// Mock shadcn components and lucide icons to simplify testing
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, variant, className }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type}
      data-testid={`button-${variant || 'default'}`}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, type, maxLength, disabled }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      maxLength={maxLength}
      disabled={disabled}
      data-testid={`input-${placeholder?.toLowerCase().replace(/\s+/g, '-') || 'default'}`}
    />
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock AlertDialog
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button data-testid="alert-dialog-cancel">{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => (
    <button data-testid="alert-dialog-action" onClick={onClick}>
      {children}
    </button>
  ),
}));

const mockServers = [
  { name: 'server-1', transport: 'http', url: 'http://localhost:8081', timeout: 10 },
  { name: 'server-2', transport: 'http', url: 'http://localhost:8082', timeout: 30 },
];

describe('MCPManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mcpApi.fetchMCPServers).mockResolvedValue(mockServers);
  });

  test('renders server list after loading', async () => {
    render(<MCPManager />);
    
    expect(screen.getByText(/Loading servers.../i)).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('server-1')).toBeDefined();
      expect(screen.getByText('server-2')).toBeDefined();
    });
    
    expect(screen.getByText('http://localhost:8081')).toBeDefined();
    expect(screen.getByText('http://localhost:8082')).toBeDefined();
  });

  test('shows empty state when no servers', async () => {
    vi.mocked(mcpApi.fetchMCPServers).mockResolvedValue([]);
    render(<MCPManager />);
    
    await waitFor(() => {
      expect(screen.getByText(/No MCP servers configured/i)).toBeDefined();
    });
  });

  test('handles load error', async () => {
    const errorMsg = 'Failed to fetch';
    vi.mocked(mcpApi.fetchMCPServers).mockRejectedValue(new Error(errorMsg));
    render(<MCPManager />);
    
    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeDefined();
    });
  });

  test('adds a new server successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.addMCPServer).mockResolvedValue({
      name: 'new-server',
      transport: 'http',
      url: 'http://localhost:9000',
      timeout: 15,
    });

    render(<MCPManager />);
    
    await waitFor(() => {
      expect(screen.getByText('server-1')).toBeDefined();
    });

    const nameInput = screen.getByTestId('input-my-server');
    const urlInput = screen.getByTestId('input-http://localhost:8080/mcp');
    const addButton = screen.getByRole('button', { name: /Add Server/i });

    await user.type(nameInput, 'new-server');
    await user.type(urlInput, 'http://localhost:9000');
    
    // Trigger submit
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mcpApi.addMCPServer).toHaveBeenCalledWith('new-server', 'http://localhost:9000', 10);
      expect(mcpApi.fetchMCPServers).toHaveBeenCalledTimes(2); // Initial + after add
    });
  });

  test('shows form validation error', async () => {
    const user = userEvent.setup();
    render(<MCPManager />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Server/i })).toBeDefined();
    });

    const addButton = screen.getByRole('button', { name: /Add Server/i });
    await user.click(addButton);

    expect(screen.getByText(/Name and URL are required/i)).toBeDefined();
    expect(mcpApi.addMCPServer).not.toHaveBeenCalled();
  });

  test('removes a server successfully', async () => {
    vi.mocked(mcpApi.removeMCPServer).mockResolvedValue(undefined);

    render(<MCPManager />);
    
    await waitFor(() => {
      expect(screen.getByText('server-1')).toBeDefined();
    });

    // Click trash icon for first server
    const deleteButtons = screen.getAllByRole('button').filter(btn => btn.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteButtons[0]);

    // Confirm in dialog
    expect(screen.getByTestId('alert-dialog')).toBeDefined();
    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => {
      expect(mcpApi.removeMCPServer).toHaveBeenCalledWith('server-1');
      expect(mcpApi.fetchMCPServers).toHaveBeenCalledTimes(2);
    });
  });
});
