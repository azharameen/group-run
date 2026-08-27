import { describe, test, expect, vi, beforeEach } from 'vitest';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '@/pages/Dashboard';
import * as apiClient from '@/api/ideas';
import type { IdeaListItem } from '@/api/ideas';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock API
vi.mock('@/api/ideas', () => ({
  fetchIdeas: vi.fn(),
  fetchIdeaDetail: vi.fn(),
  fetchIdeaFiles: vi.fn(),
  createIdea: vi.fn(),
  updateIdea: vi.fn(),
  deleteIdea: vi.fn(),
  addIdeaComment: vi.fn(),
  recordIdeaMaturity: vi.fn(),
  retryNoveltyAssessment: vi.fn(),
}));

// Mock IdeaCard component
vi.mock('@/components/IdeaCard', () => ({
  default: ({ idea, isSelected, onSelect, onDelete }: {
    idea: IdeaListItem;
    isSelected?: boolean;
    onSelect?: (id: string) => void;
    onDelete?: (id: string) => void;
  }) => (
    <div data-testid={`idea-card-${idea.idea_id}`} data-selected={isSelected}>
      <span data-testid={`idea-title-${idea.idea_id}`}>{idea.title}</span>
      {onSelect && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(idea.idea_id)}
          data-testid={`checkbox-${idea.idea_id}`}
        />
      )}
      {onDelete && (
        <button
          data-testid={`delete-btn-${idea.idea_id}`}
          onClick={() => onDelete(idea.idea_id)}
        >
          Delete
        </button>
      )}
    </div>
  ),
}));

// Mock shadcn components
vi.mock('@/components/ui/input', () => ({
  Input: React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    ({ value, onChange, placeholder, type, className, maxLength, ...props }, ref) => (
      <input
        ref={ref}
        data-testid="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        className={className}
        maxLength={maxLength}
        {...props}
      />
    )
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children }: { children?: ReactNode }) => <div data-testid="card-content">{children}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, disabled, className, type }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button
      type={type}
      data-testid={`button-${variant || 'default'}-${size || 'default'}`}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: React.forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ value, onChange, placeholder, rows, ...props }, ref) => (
      <textarea
        ref={ref}
        data-testid="textarea"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        {...props}
      />
    )
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) => {
    if (!open) return null;
    return <div data-testid="dialog">{children}</div>;
  },
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => (
    <div data-testid="dialog-title">{children}</div>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children?: ReactNode; open?: boolean }) => {
    if (!open) return null;
    return <div data-testid="alert-dialog">{children}</div>;
  },
  AlertDialogContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => (
    <div data-testid="alert-dialog-header">{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => (
    <div data-testid="alert-dialog-title">{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => (
    <div data-testid="alert-dialog-description">{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children?: ReactNode }) => (
    <div data-testid="alert-dialog-footer">{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => (
    <button data-testid="alert-dialog-cancel">{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, className }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-testid="alert-dialog-action" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockIdeas: IdeaListItem[] = [
  { idea_id: 'idea-1', title: 'First Idea', created_at: '2024-01-01', updated_at: '2024-01-02' },
  { idea_id: 'idea-2', title: 'Second Idea', created_at: '2024-01-03', updated_at: '2024-01-04' },
];

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.fetchIdeas).mockResolvedValue(mockIdeas);
  });

  test('shows loading skeleton initially', async () => {
    vi.mocked(apiClient.fetchIdeas).mockReturnValueOnce(new Promise(() => {}));
    renderWithProviders(<Dashboard />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  test('displays ideas after loading', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('idea-card-idea-1')).toBeDefined();
    });
  });

  test('shows empty state when no ideas', async () => {
    vi.mocked(apiClient.fetchIdeas).mockResolvedValueOnce([]);
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('No ideas found')).toBeDefined();
    });
  });

  test('renders search input', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Filter ideas by keyword...')).toBeDefined();
    });
  });

  test('filters ideas by search query', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('idea-card-idea-1')).toBeDefined();
    });
    const searchInput = screen.getByPlaceholderText('Filter ideas by keyword...');
    fireEvent.change(searchInput, { target: { value: 'Second' } });
    expect(screen.queryByTestId('idea-card-idea-1')).toBeNull();
    expect(screen.getByTestId('idea-card-idea-2')).toBeDefined();
  });

  test('renders New Idea button', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('New Idea')).toBeDefined();
    });
  });

  test('opens create dialog when New Idea clicked', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      const newIdeaBtn = screen.getByText('New Idea');
      fireEvent.click(newIdeaBtn);
    });
    expect(screen.getByTestId('dialog')).toBeDefined();
  });

  test('creates idea when form submitted', async () => {
    vi.mocked(apiClient.createIdea).mockResolvedValue({ idea_id: 'new-idea', message: 'created' });

    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      const newIdeaBtn = screen.getByText('New Idea');
      fireEvent.click(newIdeaBtn);
    });

    const titleInput = screen.getByPlaceholderText('Enter idea title');
    fireEvent.change(titleInput, { target: { value: 'My New Idea' } });

    await waitFor(() => {
      expect(screen.getByText('Create Idea')).not.toBeDisabled();
    });

    const createBtn = screen.getByText('Create Idea');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(apiClient.createIdea).toHaveBeenCalledWith('Autonomous discovery', 'My New Idea');
    });
  });

  test('prompts delete confirmation when delete clicked', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('delete-btn-idea-1')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('delete-btn-idea-1'));
    expect(screen.getByTestId('alert-dialog')).toBeDefined();
  });

  test('deletes idea when confirmed', async () => {
    vi.mocked(apiClient.deleteIdea).mockResolvedValue({ idea_id: 'idea-1', deleted: true });

    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('delete-btn-idea-1'));
    });

    fireEvent.click(screen.getByTestId('alert-dialog-action'));

    await waitFor(() => {
      expect(apiClient.deleteIdea).toHaveBeenCalledWith('idea-1');
    });
  });

  test('toggles idea selection via card', async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('idea-card-idea-1')).toBeDefined();
    });
    const checkbox = screen.getByTestId('checkbox-idea-1');
    expect(checkbox).toBeDefined();
    fireEvent.change(checkbox, { target: { checked: true } });
    expect(checkbox).toBeDefined();
  });
});
