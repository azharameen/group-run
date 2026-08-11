import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  fetchPendingInterrupts: vi.fn(),
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

// Mock shadcn components - pass through props
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div data-testid="card-title" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div data-testid="card-content" {...props}>{children}</div>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue, ...props }: any) => (
    <div data-testid="tabs" data-default-value={defaultValue} {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children, ...props }: any) => <div data-testid="tabs-list" {...props}>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button data-testid={`tab-trigger-${value}`} data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value, ...props }: any) => (
    <div data-testid={`tab-content-${value}`} {...props}>{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, disabled, ...props }: any) => (
    <button
      data-testid={`button-${variant || 'default'}`}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, ...props }: any) => (
    <textarea
      data-testid="textarea"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      {...props}
    />
  ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: any) => <div data-testid="scroll-area" {...props}>{children}</div>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open, ...props }: any) => {
    if (!open) return null;
    return <div data-testid="alert-dialog" {...props}>{children}</div>;
  },
  AlertDialogContent: ({ children, ...props }: any) => (
    <div data-testid="alert-dialog-content" {...props}>{children}</div>
  ),
  AlertDialogHeader: ({ children, ...props }: any) => (
    <div data-testid="alert-dialog-header" {...props}>{children}</div>
  ),
  AlertDialogTitle: ({ children, ...props }: any) => (
    <div data-testid="alert-dialog-title" {...props}>{children}</div>
  ),
  AlertDialogDescription: ({ children, ...props }: any) => (
    <div data-testid="alert-dialog-description" {...props}>{children}</div>
  ),
  AlertDialogFooter: ({ children, ...props }: any) => (
    <div data-testid="alert-dialog-footer" {...props}>{children}</div>
  ),
  AlertDialogCancel: ({ children, ...props }: any) => (
    <button data-testid="alert-dialog-cancel" {...props}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, className, ...props }: any) => (
    <button data-testid="alert-dialog-action" onClick={onClick} className={className} {...props}>
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
    vi.mocked(apiClient.fetchPendingInterrupts).mockResolvedValue([]);
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
      expect(screen.getByTestId('tab-overview')).toBeDefined();
      expect(screen.getByTestId('tab-filesystem')).toBeDefined();
      expect(screen.getByTestId('tab-comments')).toBeDefined();
    });
  });

  test('shows error state on fetch failure', async () => {
    vi.mocked(apiClient.fetchIdeaDetail).mockRejectedValue(new Error('Not found'));
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByText(/(Not found|Error)/i)).toBeDefined();
    });
  });

  test('renders Overview tab content', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('idea-detail-description')).toBeDefined();
    });
    expect(screen.getByText('Test problem')).toBeDefined();
  });

  test('renders Filesystem tab content', async () => {
    vi.mocked(apiClient.fetchIdeaFiles).mockResolvedValue([
      { path: '/test.txt', filename: 'test.txt', ext: '.txt', size_bytes: 100, modified_at: '2024-01-01', content: 'hello' },
    ]);
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-filesystem')).toBeDefined();
    });
  });

  test('renders Comments tab with comment form', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-comments')).toBeDefined();
    });
    // Click comments tab to show content
    fireEvent.click(screen.getByTestId('tab-comments'));
    expect(screen.getByTestId('comment-textarea')).toBeDefined();
  });

  test('submits comment when form submitted', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.addIdeaComment).mockResolvedValue({});
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-comments')).toBeDefined();
    });

    // Click comments tab to show content
    fireEvent.click(screen.getByTestId('tab-comments'));

    // Fill textarea to enable button
    const textarea = screen.getByTestId('comment-textarea');
    await user.type(textarea, 'New comment');

    // Click the Add Comment button
    const btn = screen.getByTestId('submit-comment-button');
    await user.click(btn);

    // Verify the mock was called
    await waitFor(() => {
      expect(vi.mocked(apiClient.addIdeaComment)).toHaveBeenCalled();
    });
  });

  test('opens delete dialog when delete triggered', async () => {
    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByTestId('alert-dialog')).toBeDefined();
  });

  test('deletes idea when confirmed', async () => {
    vi.mocked(apiClient.deleteIdea).mockResolvedValue({ idea_id: 'idea-123', deleted: true });

    render(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByTestId('confirm-delete-button'));

    await waitFor(() => {
      expect(apiClient.deleteIdea).toHaveBeenCalledWith('idea-123');
    });
  });
});
