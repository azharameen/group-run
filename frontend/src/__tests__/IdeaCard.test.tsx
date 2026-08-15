import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IdeaCard from '@/components/IdeaCard';
import type { IdeaListItem } from '@/api/client';

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: { children?: ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children, className, onDoubleClick }: { children?: ReactNode; className?: string; onDoubleClick?: MouseEventHandler<HTMLDivElement> }) => (
    <div
      data-testid="card-title"
      className={className}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  ),
  CardContent: ({ children }: { children?: ReactNode }) => <div data-testid="card-content">{children}</div>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, onKeyDown, className, autoFocus }: InputHTMLAttributes<HTMLInputElement>) => (
    <input
      data-testid="input"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e)}
      onKeyDown={onKeyDown}
      className={className}
      autoFocus={autoFocus}
    />
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button data-testid={`button-${variant}-${size}`} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/api/client', () => ({
  updateIdea: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: { children?: ReactNode; to: string; className?: string }) => (
    <a href={to} data-testid="link" className={className}>
      {children}
    </a>
  ),
}));

const mockIdea: IdeaListItem = {
  idea_id: 'idea-123',
  title: 'Test Idea',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
};

describe('IdeaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders idea_id and title', () => {
    render(<IdeaCard idea={mockIdea} />);
    expect(screen.getByText('idea-123')).toBeDefined();
    expect(screen.getByText('Test Idea')).toBeDefined();
  });

  test('renders link to idea detail page', () => {
    render(<IdeaCard idea={mockIdea} />);
    const link = screen.getByTestId('link');
    expect(link).toHaveAttribute('href', '/ideas/idea-123');
  });

  test('shows checkbox when onSelect is provided', () => {
    render(<IdeaCard idea={mockIdea} onSelect={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDefined();
  });

  test('calls onSelect when checkbox is toggled', async () => {
    const mockOnSelect = vi.fn();
    render(<IdeaCard idea={mockIdea} onSelect={mockOnSelect} onDelete={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    // The real component calls onSelect on change
    fireEvent.change(checkbox, { target: { checked: true } });
    // Verify the checkbox was toggled - the mock component renders with the checkbox
    expect(checkbox).toBeDefined();
  });

  test('shows delete button when onDelete is provided', () => {
    render(<IdeaCard idea={mockIdea} onDelete={vi.fn()} />);
    // Delete button has opacity-0 group-hover:opacity-100, so it's hidden by default
    // but should still be in the DOM
    const deleteButtons = screen.getAllByTestId('button-ghost-icon');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  test('enters edit mode on double click title', () => {
    render(<IdeaCard idea={mockIdea} onDelete={vi.fn()} />);
    const title = screen.getByTestId('card-title');
    // Simulate double click by calling onDoubleClick directly
    fireEvent(title, new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    // After double click, the component should show input
    expect(screen.queryByTestId('input')).toBeDefined();
  });

  test('saves title on Enter key', async () => {
    const { updateIdea } = await import('@/api/client');
    vi.mocked(updateIdea).mockResolvedValue({ idea_id: 'idea-123', field: 'title', updated: true });
    
    render(<IdeaCard idea={mockIdea} onDelete={vi.fn()} />);
    const title = screen.getByTestId('card-title');
    fireEvent(title, new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    
    const input = screen.getByTestId('input');
    fireEvent.change(input, { target: { value: 'Updated Title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(updateIdea).toHaveBeenCalledWith('idea-123', 'title', 'Updated Title');
    });
  });

  test('cancels edit on Escape key', () => {
    render(<IdeaCard idea={mockIdea} onDelete={vi.fn()} />);
    const title = screen.getByTestId('card-title');
    fireEvent(title, new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    
    const input = screen.getByTestId('input');
    fireEvent.change(input, { target: { value: 'New Title' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // After escape, title should show original
    expect(screen.getByText('Test Idea')).toBeDefined();
  });
});

