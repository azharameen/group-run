import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdeaDetail from '@/pages/IdeaDetail';
import * as ideasApi from '@/api/ideas';
import * as threadsApi from '@/api/threads';
import type { IdeaDetail as IdeaDetailType } from '@/api/ideas';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
// Mock useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ ideaId: 'idea-123' }),
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: { children?: ReactNode; to: string }) => (
      <a href={to} data-testid="link">
        {children}
      </a>
    ),
  };
});

// Mock API
vi.mock('@/api/ideas', () => ({
  fetchIdeas: vi.fn(),
  fetchIdeaDetail: vi.fn(),
  fetchIdeaFiles: vi.fn(),
  deleteIdea: vi.fn(),
  addIdeaComment: vi.fn(),
  updateIdea: vi.fn(),
  recordIdeaMaturity: vi.fn(),
  fetchIdeaMaturity: vi.fn().mockResolvedValue({ current_stage: 'concept', stages: [], history: [] }),
  retryNoveltyAssessment: vi.fn(),
  fetchIdeaRevisions: vi.fn().mockResolvedValue([]),
  fetchArtifactDiff: vi.fn().mockResolvedValue({ artifact_name: '', available: false, revisions: [] }),
  connectSSE: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('@/api/threads', () => ({
  fetchThreads: vi.fn(),
  fetchThreadDetail: vi.fn(),
  fetchPendingInterrupts: vi.fn(),
  createThread: vi.fn(),
  deleteThread: vi.fn(),
  updateThreadTitle: vi.fn(),
  approveInterrupt: vi.fn(),
  rejectInterrupt: vi.fn(),
}));

// Mock sub-components
vi.mock('@/components/idea-detail/IdeaActionsHeader', () => ({
  IdeaActionsHeader: ({ title, deleting, onDelete }: HTMLAttributes<HTMLDivElement> & {
    deleting?: boolean;
    onDelete?: () => void;
  }) => (
    <div data-testid="idea-actions-header">
      <span data-testid="header-title">{title}</span>
      <button data-testid="delete-trigger" onClick={onDelete} disabled={deleting}>
        Delete
      </button>
    </div>
  ),
}));

vi.mock('@/components/IdeaFilesystem', () => ({
  IdeaFilesystem: ({ files }: { files: Array<{ filename: string }> }) => (
    <div data-testid="idea-filesystem">
      {files.map((f: { filename: string }, i: number) => (
        <div key={i} data-testid="file-item">
          {f.filename}
        </div>
      ))}
    </div>
  ),
}));

// Mock shadcn components - pass through props
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-testid="card-title" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-testid="card-content" {...props}>{children}</div>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue, ...props }: HTMLAttributes<HTMLDivElement> & { defaultValue?: string }) => (
    <div data-testid="tabs" data-default-value={defaultValue} {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-testid="tabs-list" {...props}>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { value?: string }) => (
    <button data-testid={`tab-trigger-${value}`} data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value, ...props }: HTMLAttributes<HTMLDivElement> & { value?: string }) => (
    <div data-testid={`tab-content-${value}`} {...props}>{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
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
  Textarea: ({ value, onChange, placeholder, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
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
  ScrollArea: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-testid="scroll-area" {...props}>{children}</div>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open, ...props }: HTMLAttributes<HTMLDivElement> & { open?: boolean }) => {
    if (!open) return null;
    return <div data-testid="alert-dialog" {...props}>{children}</div>;
  },
  AlertDialogContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="alert-dialog-content" {...props}>{children}</div>
  ),
  AlertDialogHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="alert-dialog-header" {...props}>{children}</div>
  ),
  AlertDialogTitle: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="alert-dialog-title" {...props}>{children}</div>
  ),
  AlertDialogDescription: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="alert-dialog-description" {...props}>{children}</div>
  ),
  AlertDialogFooter: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="alert-dialog-footer" {...props}>{children}</div>
  ),
  AlertDialogCancel: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-testid="alert-dialog-cancel" {...props}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
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
    vi.mocked(ideasApi.fetchIdeaDetail).mockResolvedValue(mockDetail);
    vi.mocked(ideasApi.fetchIdeaFiles).mockResolvedValue([]);
    vi.mocked(threadsApi.fetchPendingInterrupts).mockResolvedValue([]);
  });

  test('shows loading spinner initially', () => {
    vi.mocked(ideasApi.fetchIdeaDetail).mockReturnValueOnce(new Promise(() => {}));
    renderWithProviders(<IdeaDetail />);
    expect(screen.queryByTestId('idea-actions-header')).not.toBeInTheDocument();
  });

  test('renders idea title after loading', async () => {
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('header-title')).toHaveTextContent('Test Idea');
    });
  });

  test('renders 3 tabs: Overview, Filesystem, Comments', async () => {
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-overview')).toBeDefined();
      expect(screen.getByTestId('tab-filesystem')).toBeDefined();
      expect(screen.getByTestId('tab-comments')).toBeDefined();
    });
  });

  test('shows error state on fetch failure of main detail request', async () => {
    vi.mocked(ideasApi.fetchIdeaDetail).mockRejectedValue(new Error('Not found'));
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByText(/(Not found|Error)/i)).toBeDefined();
    });
  });

  test('renders remaining idea data when a non-critical request (e.g. fetchIdeaFiles) fails', async () => {
    vi.mocked(ideasApi.fetchIdeaFiles).mockRejectedValue(new Error('Failed to fetch files'));
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('header-title')).toHaveTextContent('Test Idea');
      expect(screen.getByTestId('idea-detail-description')).toHaveTextContent('Test problem');
    });
  });

  test('renders Overview tab content', async () => {
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('idea-detail-description')).toBeDefined();
    });
    expect(screen.getByText('Test problem')).toBeDefined();
  });

  test('renders Filesystem tab content', async () => {
    vi.mocked(ideasApi.fetchIdeaFiles).mockResolvedValue([
      { path: '/test.txt', filename: 'test.txt', ext: '.txt', size_bytes: 100, modified_at: '2024-01-01', content: 'hello' },
    ]);
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-filesystem')).toBeDefined();
    });
  });

  test('renders Comments tab with comment form', async () => {
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-comments')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('tab-comments'));
    expect(screen.getByTestId('comment-textarea')).toBeDefined();
  });

  test('submits comment when form submitted', async () => {
    const user = userEvent.setup();
    vi.mocked(ideasApi.addIdeaComment).mockResolvedValue({
      idea_id: 'idea_1',
      comment: { author: 'User', text: 'A comment', timestamp: '2024-01-01T00:00:00Z' },
    });
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-comments')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('tab-comments'));

    const textarea = screen.getByTestId('comment-textarea');
    await user.type(textarea, 'New comment');

    const btn = screen.getByTestId('submit-comment-button');
    await user.click(btn);

    await waitFor(() => {
      expect(vi.mocked(ideasApi.addIdeaComment)).toHaveBeenCalledWith('idea-123', 'New comment');
    });
  });

  test('opens delete dialog when delete triggered', async () => {
    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByTestId('alert-dialog')).toBeDefined();
  });

  test('deletes idea when confirmed', async () => {
    vi.mocked(ideasApi.deleteIdea).mockResolvedValue({ idea_id: 'idea-123', deleted: true });

    renderWithProviders(<IdeaDetail />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByTestId('confirm-delete-button'));

    await waitFor(() => {
      expect(ideasApi.deleteIdea).toHaveBeenCalledWith('idea-123');
    });
  });
});
