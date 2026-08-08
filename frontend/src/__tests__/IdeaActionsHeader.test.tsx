import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IdeaActionsHeader } from '@/components/idea-detail/IdeaActionsHeader';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, variant, size, className, disabled, onClick, asChild }: any) => (
    <button
      data-testid={`button-${variant}-${size}`}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <div data-testid="separator" />,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: any) => {
    if (asChild) return <>{children}</>;
    return <div>{children}</div>;
  },
  DropdownMenuContent: ({ children }: any) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, disabled, className }: any) => (
    <div
      data-testid="dropdown-item"
      className={className}
      onClick={onClick}
      role="menuitem"
      aria-disabled={disabled ? 'true' : 'false'}
    >
      {children}
    </div>
  ),
}));

describe('IdeaActionsHeader', () => {
  const defaultProps = {
    ideaId: 'idea-123',
    title: 'Test Idea',
    deleting: false,
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders title', () => {
    render(<IdeaActionsHeader {...defaultProps} />);
    expect(screen.getByText('Test Idea')).toBeDefined();
  });

  test('renders idea ID', () => {
    render(<IdeaActionsHeader {...defaultProps} />);
    expect(screen.getByText('idea-123')).toBeDefined();
  });

  test('falls back to ideaId when title is missing', () => {
    render(<IdeaActionsHeader {...defaultProps} title={undefined} />);
    const elements = screen.getAllByText('idea-123');
    expect(elements.length).toBeGreaterThan(0);
  });

  test('renders dropdown trigger button', () => {
    render(<IdeaActionsHeader {...defaultProps} />);
    expect(screen.getByTestId('button-ghost-icon')).toBeDefined();
  });

  test('renders delete option in dropdown', () => {
    render(<IdeaActionsHeader {...defaultProps} />);
    expect(screen.getByText('Delete Idea')).toBeDefined();
  });

  test('calls onDelete when delete item is clicked', () => {
    render(<IdeaActionsHeader {...defaultProps} />);
    const deleteItem = screen.getByText('Delete Idea').closest('[role="menuitem"]');
    fireEvent.click(deleteItem!);
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  test('delete item is disabled when deleting is true', () => {
    render(<IdeaActionsHeader {...defaultProps} deleting={true} />);
    const deleteItem = screen.getByText('Delete Idea').closest('[role="menuitem"]');
    expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
  });
});
