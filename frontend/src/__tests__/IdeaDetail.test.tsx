import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdeaDetail from '@/pages/IdeaDetail';
import * as apiClient from '@/api/client';
import * as deepagents from '@/api/deepagents';
import type { IdeaDetail as IdeaDetailType } from '@/api/client';

// Mock useParams
vi.mock('react-router-dom', () => ({
  useParams: () => ({ ideaId: 'idea-123' }),
  Link: ({ children, to }: any) => (
    <a href={to} data-testid="link">
      {children}
    </a>
  ),
}));

// Mock API
vi.mock('@/api/client', () => ({
  fetchIdeaDetail: vi.fn(),
  fetchIdeaFiles: vi.fn(),
  deleteIdea: vi.fn(),
  addIdeaComment: vi.fn(),
  connectSSE: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('@/api/deepagents', () => ({
  fetchPendingInterrupts: vi.fn(),
}));

// Mock sub-components
vi.mock('@/components/idea-detail/IdeaActionsHeader', () => ({
  IdeaActionsHeader: ({ title, deleting, onDelete }: any) => (
    <div data-testid="idea-actions-header">
      <span data-testid="header-title">{title}</span>
      <button data-testid="delete-trigger" onClick={onDelete} disabled={deleting}>
        Delete
      </button>
    </div>
  ),
}));

vi.mock('@/components/IdeaFilesystem', () => ({
  IdeaFilesystem: ({ files }: any) => (
    <div data-testid="idea-filesystem">
      {files.map((f: any, i: number) => (
        <div key={i} data-testid="file-item">
          {f.filename}
        </div>
      ))}
    </div>
  ),
}));

// Mock shadcn components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: any) => (
    <div data-testid="tabs" data-default-value={defaultValue}>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button data-testid={`tab-trigger-${value}`} data-value={value}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, disabled, className }: any) => (
    <button
      data-testid={`button-${variant || 'default'}`}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder }: any) => (
    <textarea
      data-testid="textarea"
      value={value}
      onChange={(e: any) => onChange(e)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => {
    if (!open) return null;
    return <div data-testid="alert-dialog">{children}</div>;
  },
  AlertDialogContent: ({ children }: any) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: any) => (
    <div data-testid="alert-dialog-header">{children}</div>
  ),
  AlertDialogTitle: ({ children }: any) => (
    <div data-testid="alert-dialog-title">{children}</div>
  ),
  AlertDialogDescription: ({ children }: any) => (
    <div data-testid="alert-dialog-description">{children}</div>
  ),
  AlertDialogFooter: ({ children }: any) => (
    <div data-testid="alert-dialog-footer">{children}</div>
  ),
  AlertDialogCancel: ({ children }: any) => (
    <button data-testid="alert-dialog-cancel">{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, className }: any) => (
    <button data-testid="alert-dialog-action" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockDetail: IdeaDetailType = {
  idea: {
    idea_id: 'idea-123',
    title: 'Test Idea',
    problem_statement: 'Test problem',
    solution_concept: 'Test solution',
    source_evidence: ['evidence-1'],
    created_at: '2024-01-01',
    updated_at: '2024-01-02',
  },
  comments: [
    { author: 'User', text: 'Test comment', timestamp: '2024-01-02' },
  ],
};

describe('IdeaDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.fetchIdeaDetail).mockResolvedValue(mockDetail);
    vi.mocked(apiClient.fetchIdeaFiles).mockResolvedValue([]);
    vi.mocked(deepagents.fetchPendingInterrupts).mockResolvedValue([]);
  });

  test('shows loading spinner initially', () => {
    vi.mocked(apiClient.fetchIdeaDetail).mockReturnValueOnce(new Promise(() => {}));
    render(<IdeaDetail />);
    // Loading state shows a spinner, no header should be visible yet
    expect(screen.queryByTestId('idea-actions-header')).not.toBeInTheDocument();
  });

  test('renders idea title after loading', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('header-title')).toHaveTextContent('Test Idea');
    });
  });

  test('renders 3 tabs: Overview, Filesystem, Comments', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-trigger-overview')).toBeDefined();
      expect(screen.getByTestId('tab-trigger-filesystem')).toBeDefined();
      expect(screen.getByTestId('tab-trigger-comments')).toBeDefined();
    });
  });

  test('shows error state on fetch failure', async () => {
    vi.mocked(apiClient.fetchIdeaDetail).mockRejectedValue(new Error('Not found'));
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeDefined();
    });
  });

  test('renders Overview tab content', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-content-overview')).toBeDefined();
    });
    expect(screen.getByText('Test problem')).toBeDefined();
  });

  test('renders Filesystem tab content', async () => {
    vi.mocked(apiClient.fetchIdeaFiles).mockResolvedValue([
      { path: '/test.txt', filename: 'test.txt', ext: '.txt', size_bytes: 100, modified_at: '2024-01-01', content: 'hello' },
    ]);
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-trigger-filesystem')).toBeDefined();
    });
  });

  test('renders Comments tab with comment form', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-trigger-comments')).toBeDefined();
    });
    expect(screen.getByTestId('tab-content-comments')).toBeDefined();
  });

  test('submits comment when form submitted', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.addIdeaComment).mockResolvedValue({});
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-trigger-comments')).toBeDefined();
    });

    // Fill textarea to enable button
    const textarea = screen.getByPlaceholderText('Write a note for this idea');
    await user.type(textarea, 'New comment');

    // Click the Add Comment button (find by testid)
    const btn = screen.getByTestId('button-default');
    await user.click(btn);

    // Verify the mock was called
    await waitFor(() => {
      expect(vi.mocked(apiClient.addIdeaComment)).toHaveBeenCalled();
    });
  });

  test('opens delete dialog when delete triggered', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('delete-trigger')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('delete-trigger'));
    expect(screen.getByTestId('alert-dialog')).toBeDefined();
  });

  test('deletes idea when confirmed', async () => {
    vi.mocked(apiClient.deleteIdea).mockResolvedValue({ idea_id: 'idea-123', deleted: true });

    render(<IdeaDetail />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('delete-trigger'));
    });

    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => {
      expect(apiClient.deleteIdea).toHaveBeenCalledWith('idea-123');
    });
  });
});
