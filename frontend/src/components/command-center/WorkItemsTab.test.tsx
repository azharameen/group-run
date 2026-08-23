import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkItemsTab from './WorkItemsTab';
import * as workItemsApi from '@/api/workItems';
import type { WorkItem } from '@/api/workItems';
import * as orgApi from '@/api/organizations';
import type { OrganizationSummary } from '@/api/organizations';

// WorkItemsTab reaches the API via the @/api/client barrel, which re-exports
// these same modules — vitest resolves both to one registry entry.
vi.mock('@/api/workItems', () => ({
  submitWorkItem: vi.fn(),
  fetchWorkItems: vi.fn(),
  fetchWorkItem: vi.fn(),
  fetchLifecycleHistory: vi.fn(),
  listDecisions: vi.fn(),
  transitionWorkItem: vi.fn(),
  listReviews: vi.fn(),
  createReview: vi.fn(),
  LIFECYCLE_PHASES: ['new', 'ideation', 'product_definition', 'development', 'testing', 'deployment', 'monitoring'],
}));

vi.mock('@/api/organizations', () => ({
  fetchOrganizations: vi.fn(),
  fetchOrganization: vi.fn(),
  createOrganization: vi.fn(),
}));

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

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children, ...rest }: HTMLAttributes<HTMLDivElement>) => (
    <div {...rest}>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

const org: OrganizationSummary = {
  org_id: 'org-1',
  name: 'Acme Robotics',
  description: '',
  created_at: '2026-07-20T09:00:00+00:00',
  updated_at: '2026-07-20T09:00:00+00:00',
  department_count: 2,
  team_count: 1,
  agent_count: 4,
};

const makeWorkItem = (id: string, title: string, department: string): WorkItem => ({
  work_item_id: id,
  org_id: org.org_id,
  title,
  description: 'Needs engineering review',
  status: 'new',
  owner_agent_id: 'chief_of_staff',
  source: 'agent',
  department_id: department,
  routing: {
    department_id: department,
    decided_by: 'chief_of_staff',
    decided_at: '2026-07-20T10:00:00+00:00',
    confidence: 'high',
    reasoning: `Explicitly assigned to the ${department} department by the submitter.`,
    alternatives: ['ideation', 'engineering'],
  },
  created_at: '2026-07-20T10:00:00+00:00',
  updated_at: '2026-07-20T10:00:00+00:00',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workItemsApi.listReviews).mockResolvedValue([]);
});

describe('WorkItemsTab', () => {
  test('opens decision history and renders decisions', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listDecisions).mockResolvedValue([
      {
        decision_id: 'd-1',
        work_item_id: 'wi-1',
        agent_id: 'chief_of_staff',
        decision_type: 'routing',
        reasoning: 'Explicitly assigned to the engineering department by the submitter.',
        evidence: ['work_item:wi-1:routing:d-1'],
        confidence: 'high',
        alternatives: ['ideation'],
        decided_at: '2026-07-20T10:00:00+00:00',
      },
    ]);

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-decisions-button'));

    await waitFor(() => {
      expect(screen.getByTestId('work-item-decisions-dialog')).toBeTruthy();
    });
    expect(workItemsApi.listDecisions).toHaveBeenCalledWith({ work_item_id: 'wi-1' });
    await waitFor(() => {
      expect(screen.getByTestId('decision-row')).toBeTruthy();
    });
    expect(screen.getAllByText(/chief_of_staff/).length).toBeGreaterThan(0);
    expect(screen.getByText(/work_item:wi-1:routing:d-1/)).toBeTruthy();
  });

  test('shows empty state when no decisions recorded', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listDecisions).mockResolvedValue([]);

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-decisions-button'));

    await waitFor(() => {
      expect(screen.getByTestId('work-item-decisions-empty')).toBeTruthy();
    });
  });

  test('surfaces decision list API errors', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listDecisions).mockRejectedValue(new Error('boom'));

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-decisions-button'));

    await waitFor(() => {
      expect(screen.getByTestId('work-item-decisions-error')).toHaveTextContent('boom');
    });
  });

  test('renders work item rows with status, department, and routing reasoning', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
      makeWorkItem('wi-2', 'Draft brand name shortlist', 'ideation'),
    ]);

    render(<WorkItemsTab />);

    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(2);
    });
    expect(screen.getAllByTestId('work-item-status').map((el) => el.textContent)).toEqual([
      'new',
      'new',
    ]);
    expect(screen.getByText('Routed to: engineering')).toBeTruthy();
    expect(screen.getAllByText('confidence: high')).toHaveLength(2);
    expect(
      screen.getByText(/Explicitly assigned to the engineering department by the submitter/),
    ).toBeTruthy();
    expect(
      screen.getByText('Prototype battery housing'),
    ).toBeTruthy();
  });

  test('shows the no-organization empty state when no organizations exist', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([]);

    render(<WorkItemsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('work-items-empty')).toBeTruthy();
    });
    expect(screen.getByText(/No organization yet/i)).toBeTruthy();
    expect(workItemsApi.fetchWorkItems).not.toHaveBeenCalled();
  });

  test('shows the error state with a retry button when loading fails', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockRejectedValue(new Error('API 500: Internal Server Error'));

    render(<WorkItemsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('work-items-error')).toBeTruthy();
    });
    expect(screen.getByText(/Failed to load work items/i)).toBeTruthy();
    expect(screen.getByText('API 500: Internal Server Error')).toBeTruthy();

    // Retry succeeds on the second attempt.
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });
  });

  test('shows the no-items empty state when the organization has no work items', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([]);

    render(<WorkItemsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('work-items-empty')).toBeTruthy();
    });
    expect(screen.getByText(/No work items yet/i)).toBeTruthy();
  });

  test('opens the lifecycle history dialog and lists every event', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.fetchLifecycleHistory).mockResolvedValue([
      {
        event_id: 'created-wi-1', work_item_id: 'wi-1', event_type: 'created',
        from_status: '', to_status: 'new', from_department: '', to_department: 'engineering',
        decided_by: 'chief_of_staff', decided_at: '2026-07-20T10:00:00+00:00',
        confidence: 'high', reasoning: 'Explicitly assigned to the engineering department by the submitter.',
        alternatives: ['ideation'],
      },
      {
        event_id: 'ev-2', work_item_id: 'wi-1', event_type: 'handoff',
        from_status: 'product_definition', to_status: 'development',
        from_department: 'ideation', to_department: 'technology',
        decided_by: 'chief_of_staff', decided_at: '2026-07-21T10:00:00+00:00',
        confidence: 'high', reasoning: 'Handoff from ideation to technology.', alternatives: ['testing'],
      },
    ]);

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getByTestId('work-item-row')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('work-item-history-button'));

    const dialog = await screen.findByTestId('work-item-history-dialog');
    expect(dialog).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByTestId('lifecycle-event-row')).toHaveLength(2);
    });
    expect(dialog).toHaveTextContent('created');
    expect(dialog).toHaveTextContent('handoff');
    expect(dialog).toHaveTextContent('chief_of_staff');
    expect(workItemsApi.fetchLifecycleHistory).toHaveBeenCalledWith('wi-1');
  });

  test('advance button posts the next phase and refreshes the list', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    const advanced = makeWorkItem('wi-1', 'Prototype battery housing', 'engineering');
    advanced.status = 'ideation';
    vi.mocked(workItemsApi.transitionWorkItem).mockResolvedValue({
      work_item: advanced,
      event: {
        event_id: 'ev-1', work_item_id: 'wi-1', event_type: 'transition',
        from_status: 'new', to_status: 'ideation', from_department: 'engineering',
        to_department: 'engineering', decided_by: 'chief_of_staff',
        decided_at: '2026-07-21T10:00:00+00:00', confidence: 'high',
        reasoning: 'Transitioned from new to ideation.', alternatives: ['product_definition'],
      },
    });

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getByTestId('work-item-row')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('work-item-advance-button'));

    await waitFor(() => {
      expect(workItemsApi.transitionWorkItem).toHaveBeenCalledWith('wi-1', { status: 'ideation' });
    });
    // The list is re-fetched after a successful advance.
    await waitFor(() => {
      expect(workItemsApi.fetchWorkItems).toHaveBeenCalledTimes(2);
    });
  });

  test('advance button is disabled on the final monitoring phase', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    const monitoring = makeWorkItem('wi-1', 'Shipped product', 'technology');
    monitoring.status = 'monitoring';
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([monitoring]);

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getByTestId('work-item-row')).toBeTruthy();
    });

    expect(screen.getByTestId('work-item-advance-button')).toBeDisabled();
  });

  test('review dialog lists existing reviews', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listReviews).mockResolvedValue([
      {
        review_id: 'r-1', work_item_id: 'wi-1', reviewer: 'user',
        accuracy_score: 95, summary: 'Solid claims.', flagged_for_review: false,
        reviewed_at: '2026-07-20T10:00:00+00:00',
      },
    ]);

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-review-button'));

    await waitFor(() => {
      expect(screen.getByTestId('work-item-review-dialog')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('review-row')).toBeTruthy();
    });
    expect(screen.getByText('Solid claims.')).toBeTruthy();
  });

  test('submitting a review calls createReview and refreshes the list', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.createReview).mockResolvedValue({
      review_id: 'r-1', work_item_id: 'wi-1', reviewer: 'user',
      accuracy_score: 95, summary: 'Solid claims.', flagged_for_review: false,
      reviewed_at: '2026-07-20T10:00:00+00:00',
    });

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-review-button'));
    await waitFor(() => {
      expect(screen.getByTestId('work-item-review-dialog')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('work-item-review-score-input'), { target: { value: '95' } });
    fireEvent.change(screen.getByTestId('work-item-review-summary-input'), { target: { value: 'Solid claims.' } });
    fireEvent.click(screen.getByTestId('work-item-review-submit-button'));

    await waitFor(() => {
      expect(workItemsApi.createReview).toHaveBeenCalledWith('wi-1', {
        reviewer: 'user', accuracy_score: 95, summary: 'Solid claims.',
      });
    });
    // Reviews are re-fetched after a successful submit: initial mount load + open + post-submit.
    await waitFor(() => {
      expect(vi.mocked(workItemsApi.listReviews).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  test('shows a flagged badge on the row when the latest review is flagged', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listReviews).mockResolvedValue([
      {
        review_id: 'r-1', work_item_id: 'wi-1', reviewer: 'user',
        accuracy_score: 70, summary: 'Weak sourcing.', flagged_for_review: true,
        reviewed_at: '2026-07-20T10:00:00+00:00',
      },
    ]);

    render(<WorkItemsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('work-item-flagged-badge')).toBeTruthy();
    });
  });

  test('rejects out-of-range or non-integer scores before submitting', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listReviews).mockResolvedValue([]);

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-review-button'));
    await waitFor(() => {
      expect(screen.getByTestId('work-item-review-dialog')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('work-item-review-score-input'), { target: { value: '150' } });
    fireEvent.change(screen.getByTestId('work-item-review-summary-input'), { target: { value: 'Too high.' } });
    fireEvent.click(screen.getByTestId('work-item-review-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('work-item-review-error')).toHaveTextContent(
        'Accuracy score must be a whole number between 0 and 100',
      );
    });
    expect(workItemsApi.createReview).not.toHaveBeenCalled();
  });

  test('surfaces review API errors', async () => {
    vi.mocked(orgApi.fetchOrganizations).mockResolvedValue([org]);
    vi.mocked(workItemsApi.fetchWorkItems).mockResolvedValue([
      makeWorkItem('wi-1', 'Prototype battery housing', 'engineering'),
    ]);
    vi.mocked(workItemsApi.listReviews).mockRejectedValue(new Error('boom'));

    render(<WorkItemsTab />);
    await waitFor(() => {
      expect(screen.getAllByTestId('work-item-row')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('work-item-review-button'));

    await waitFor(() => {
      expect(screen.getByTestId('work-item-review-error')).toHaveTextContent('boom');
    });
  });
});
