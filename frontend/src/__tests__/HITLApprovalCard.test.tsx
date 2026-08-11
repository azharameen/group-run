import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HITLApprovalCard } from '@/components/deepagents/HITLApprovalCard';
import * as threadsApi from '@/api/threads';
import type { InterruptPayload } from '@/api/threads';

vi.mock('@/api/threads', () => ({
  approveInterrupt: vi.fn().mockResolvedValue({}),
  rejectInterrupt: vi.fn().mockResolvedValue({}),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

function makeInterrupt(p?: Partial<InterruptPayload>): InterruptPayload {
  const props = p ?? {};
  return {
    id: props.id ?? '1',
    thread_id: props.thread_id ?? 'thread-1',
    tool_name: props.tool_name ?? 'search',
    tool_input: props.tool_input ?? {},
    message: props.message ?? 'Needs approval',
    status: props.status ?? 'pending',
    created_at: props.created_at ?? new Date().toISOString(),
    updated_at: props.updated_at ?? new Date().toISOString(),
  };
}

describe('HITLApprovalCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders empty state with no interrupts', () => {
    render(<HITLApprovalCard interrupts={[]} />);
    expect(screen.getByText('No pending approvals.')).toBeInTheDocument();
  });

  test('renders interrupt card with tool name badge and message', () => {
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} />);
    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.getByText('Needs approval')).toBeInTheDocument();
  });

  test('renders tool_input JSON preview when present', () => {
    render(<HITLApprovalCard interrupts={[makeInterrupt({ tool_input: { q: 'hello' } })]} />);
    expect(screen.getByText(/"q": "hello"/)).toBeInTheDocument();
  });

  test('approve button calls approveInterrupt with correct params and fires onApproved', async () => {
    const onApproved = vi.fn();
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} onApproved={onApproved} />);

    fireEvent.change(screen.getByPlaceholderText('Add reason or feedback...'), {
      target: { value: 'Approved' },
    });
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(threadsApi.approveInterrupt).toHaveBeenCalledWith('1', 'approved', 'Approved')
    );
    expect(onApproved).toHaveBeenCalledWith('1');
  });

  test('reject button calls rejectInterrupt with correct params and fires onRejected', async () => {
    const onRejected = vi.fn();
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} onRejected={onRejected} />);

    fireEvent.change(screen.getByPlaceholderText('Add reason or feedback...'), {
      target: { value: 'Reject this' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() =>
      expect(threadsApi.rejectInterrupt).toHaveBeenCalledWith('1', 'Reject this')
    );
    expect(onRejected).toHaveBeenCalledWith('1');
  });

  test('textarea input updates comment state before approve', async () => {
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} />);

    const textarea = screen.getByPlaceholderText('Add reason or feedback...');
    fireEvent.change(textarea, { target: { value: 'My note' } });
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(threadsApi.approveInterrupt).toHaveBeenCalledWith('1', 'approved', 'My note')
    );
  });

  test('approve button shows loading spinner during API call', async () => {
    let resolveFn: ((value: InterruptPayload) => void) | undefined;
    vi.mocked(threadsApi.approveInterrupt).mockImplementation(
      () => new Promise((resolve) => { resolveFn = (v) => resolve(v as InterruptPayload); })
    );

    render(<HITLApprovalCard interrupts={[makeInterrupt()]} />);

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getAllByRole('button', { name: /approve/i })[0]).toBeDisabled();

    resolveFn?.(makeInterrupt());
    await waitFor(() => expect(threadsApi.approveInterrupt).toHaveBeenCalled());
  });

  test('409 error on approve shows "Already resolved" toast', async () => {
    vi.mocked(threadsApi.approveInterrupt).mockRejectedValue(new Error('409 conflict'));
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} />);

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Already resolved' })
      )
    );
  });

  test('404 error on reject shows "Not found" toast', async () => {
    vi.mocked(threadsApi.rejectInterrupt).mockRejectedValue(new Error('404 not found'));
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} />);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not found' }))
    );
  });

  test('multiple interrupts render multiple cards', () => {
    render(
      <HITLApprovalCard
        interrupts={[
          makeInterrupt({ id: '1', message: 'First' }),
          makeInterrupt({ id: '2', tool_name: 'calc', message: 'Second' }),
        ]}
      />
    );

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  test('reject button handles 409 error with "Already resolved" toast', async () => {
    vi.mocked(threadsApi.rejectInterrupt).mockRejectedValue(new Error('409 conflict'));
    render(<HITLApprovalCard interrupts={[makeInterrupt()]} />);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Already resolved' })
      )
    );
  });
});
