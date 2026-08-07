import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NavThreads } from '@/components/nav-threads';
import type { ThreadMetadata } from '@/api/client';
import * as apiClient from '@/api/client';
import * as sidebar from '@/components/ui/sidebar';

// Mock the API client
vi.mock('@/api/client', () => ({
	createThread: vi.fn(),
	updateThread: vi.fn(),
	deleteThread: vi.fn(),
	listThreads: vi.fn(),
}));

// Mock sidebar hook
vi.mock('@/components/ui/sidebar', () => ({
	SidebarGroup: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-testid="sidebar-group" className={className}>{children}</div>,
	SidebarGroupLabel: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-testid="sidebar-label" className={className}>{children}</div>,
	SidebarGroupContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-testid="sidebar-content" className={className}>{children}</div>,
	SidebarMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-menu">{children}</div>,
	SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-menu-item">{children}</div>,
	SidebarMenuButton: ({ children, isActive, onClick, tooltip, className }: { children: React.ReactNode; isActive?: boolean; onClick?: () => void; tooltip?: string; className?: string }) => (
		<button data-testid="thread-button" data-active={isActive} onClick={onClick} className={className}>
			{children}
		</button>
	),
	SidebarMenuAction: ({ children }: { children: React.ReactNode }) => <button data-testid="thread-menu-action">{children}</button>,
	useSidebar: vi.fn(),
}));

// Mock dropdown menu
vi.mock('@/components/ui/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-menu">{children}</div>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
	DropdownMenuItem: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
		<button data-testid="dropdown-item" onClick={onClick} className={className}>{children}</button>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-trigger">{children}</div>,
}));

// Mock dialog components
vi.mock('@/components/ui/dialog', () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
	DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock alert dialog
vi.mock('@/components/ui/alert-dialog', () => ({
	AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => open ? <div data-testid="alert-dialog">{children}</div> : null,
	AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="alert-content">{children}</div>,
	AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	AlertDialogCancel: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
		<button data-testid="alert-cancel" onClick={onClick}>{children}</button>
	),
	AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
		<button data-testid="alert-action" onClick={onClick}>{children}</button>
	),
}));

// Mock button
vi.mock('@/components/ui/button', () => ({
	Button: ({ children, onClick, disabled, variant, size, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; size?: string; className?: string }) => (
		<button data-testid={`button-${variant || 'default'}`} disabled={disabled} onClick={onClick} className={className}>{children}</button>
	),
}));

// Mock input
vi.mock('@/components/ui/input', () => ({
	Input: ({ value, onChange, placeholder, type, className, autoFocus }: { value?: string; onChange?: (e: any) => void; placeholder?: string; type?: string; className?: string; autoFocus?: boolean }) => (
		<input data-testid="input" value={value} onChange={onChange} placeholder={placeholder} type={type} className={className} autoFocus={autoFocus} />
	),
}));

// Mock tooltip
vi.mock('@/components/ui/tooltip', () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
	TooltipContent: ({ children, side, className }: { children: React.ReactNode; side?: string; className?: string }) => <div>{children}</div>,
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
	MessageSquare: ({ className }: { className?: string }) => <svg data-testid="icon-message" />,
	MoreHorizontal: () => <svg data-testid="icon-more" />,
	Pencil: ({ className }: { className?: string }) => <svg data-testid="icon-pencil" />,
	Plus: ({ className }: { className?: string }) => <svg data-testid="icon-plus" />,
	Trash2: ({ className }: { className?: string }) => <svg data-testid="icon-trash" />,
	Search: ({ className }: { className?: string }) => <svg data-testid="icon-search" />,
}));

function makeThreads(count: number = 1): ThreadMetadata[] {
	return Array.from({ length: count }, (_, i) => ({
		thread_id: `thread-${i + 1}`,
		title: `Thread ${i + 1}`,
		created_at: '2026-08-07T00:00:00Z',
		updated_at: '2026-08-07T00:00:00Z',
		status: 'active',
		idea_id: null,
		tags: [],
		agent_names: [],
	}));
}

beforeEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	// Default: expanded sidebar, not mobile
	vi.mocked(sidebar.useSidebar).mockReturnValue({
		state: 'expanded',
		isMobile: false,
		open: true,
		setOpen: vi.fn(),
		openMobile: false,
		setOpenMobile: vi.fn(),
		toggleSidebar: vi.fn(),
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('NavThreads', () => {
	test('renders thread list with thread titles', () => {
		const threads = makeThreads(3);

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		expect(screen.getByText('Thread 1')).toBeInTheDocument();
		expect(screen.getByText('Thread 2')).toBeInTheDocument();
		expect(screen.getByText('Thread 3')).toBeInTheDocument();
	});

	test('shows empty state when no threads exist', () => {
		render(
			<NavThreads
				threads={[]}
				activeThreadId={null}
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		expect(screen.getByText('No threads created yet.')).toBeInTheDocument();
	});

	test('highlights active thread', () => {
		const threads = makeThreads(2);

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		const buttons = screen.getAllByTestId('thread-button');
		expect(buttons[0]).toHaveAttribute('data-active', 'true');
		expect(buttons[1]).toHaveAttribute('data-active', 'false');
	});

	test('calls onSelectThread when clicking a thread', () => {
		const threads = makeThreads(2);
		const onSelectThread = vi.fn();

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={onSelectThread}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		const buttons = screen.getAllByTestId('thread-button');
		fireEvent.click(buttons[1]);

		expect(onSelectThread).toHaveBeenCalledWith('thread-2');
	});

	test('filters threads by search query', () => {
		const threads = makeThreads(3);

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		const input = screen.getByTestId('input');
		fireEvent.change(input, { target: { value: 'Thread 2' } });

		expect(screen.queryByText('Thread 1')).not.toBeInTheDocument();
		expect(screen.getByText('Thread 2')).toBeInTheDocument();
		expect(screen.queryByText('Thread 3')).not.toBeInTheDocument();
	});

	test('shows no matching threads when search has no results', () => {
		const threads = makeThreads(1);

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		const input = screen.getByTestId('input');
		fireEvent.change(input, { target: { value: 'nonexistent' } });

		expect(screen.getByText('No matching threads.')).toBeInTheDocument();
	});

	test('new thread button triggers createThread', async () => {
		const threads = makeThreads(1);
		const newThread = makeThreads(1)[0];
		newThread.thread_id = 'new-thread';
		vi.spyOn(apiClient, 'createThread').mockResolvedValue(newThread);
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([...threads, newThread]);

		const onSelectThread = vi.fn();
		const onThreadsUpdate = vi.fn();

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={onSelectThread}
				onThreadsUpdate={onThreadsUpdate}
			/>,
		);

		const createButton = screen.getByTestId('button-ghost');
		fireEvent.click(createButton);

		await waitFor(() => {
			expect(apiClient.createThread).toHaveBeenCalledWith({
				title: 'New Chat',
				idea_id: null,
			});
			expect(onSelectThread).toHaveBeenCalledWith('new-thread');
			expect(onThreadsUpdate).toHaveBeenCalled();
		});
	});

	test('returns null in collapsed rail mode', () => {
		vi.mocked(sidebar.useSidebar).mockReturnValue({
			state: 'collapsed',
			isMobile: false,
			open: true,
			setOpen: vi.fn(),
			openMobile: false,
			setOpenMobile: vi.fn(),
			toggleSidebar: vi.fn(),
		});

		const threads = makeThreads(1);
		const container = document.createElement('div');

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
			{ container },
		);

		expect(container.innerHTML).toBe('');
	});

	test('shows rename option in dropdown menu', () => {
		const threads = makeThreads(1);

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		expect(screen.getByText('Rename')).toBeInTheDocument();
	});

	test('shows delete option in dropdown menu', () => {
		const threads = makeThreads(1);

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={vi.fn()}
			/>,
		);

		expect(screen.getByText('Delete')).toBeInTheDocument();
	});

	test('rename flow calls updateThread with new title', async () => {
		const threads = makeThreads(1);
		const updated = makeThreads(1)[0];
		updated.title = 'New Title';
		vi.spyOn(apiClient, 'updateThread').mockResolvedValue(updated);
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([updated]);

		const onThreadsUpdate = vi.fn();

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={vi.fn()}
				onThreadsUpdate={onThreadsUpdate}
			/>,
		);

		// Open rename dialog by clicking Rename dropdown item
		fireEvent.click(screen.getByText('Rename'));

		// Wait for dialog to appear and get the dialog content input
		const dialog = await screen.findByTestId('dialog');
		const dialogContent = within(dialog);
		const input = dialogContent.getByTestId('input');

		// Clear input and type new title
		fireEvent.change(input, { target: { value: 'New Title' } });

		// Confirm rename
		const saveButton = dialogContent.getByText('Save Changes');
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(apiClient.updateThread).toHaveBeenCalledWith('thread-1', { title: 'New Title' });
			expect(apiClient.listThreads).toHaveBeenCalled();
			expect(onThreadsUpdate).toHaveBeenCalledWith([updated]);
		});
	});

	test('delete flow calls deleteThread and clears active thread', async () => {
		const threads = makeThreads(1);
		vi.spyOn(apiClient, 'deleteThread').mockResolvedValue(undefined);
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);

		const onSelectThread = vi.fn();
		const onThreadsUpdate = vi.fn();

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={onSelectThread}
				onThreadsUpdate={onThreadsUpdate}
			/>,
		);

		// Open delete dialog
		fireEvent.click(screen.getByText('Delete'));

		// Confirm delete
		const confirmButton = screen.getByTestId('alert-action');
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(apiClient.deleteThread).toHaveBeenCalledWith('thread-1');
			expect(onSelectThread).toHaveBeenCalledWith(null);
			expect(onThreadsUpdate).toHaveBeenCalledWith([]);
		});
	});

	test('delete flow does not clear active thread when deleting a different thread', async () => {
		const threads = makeThreads(2);
		vi.spyOn(apiClient, 'deleteThread').mockResolvedValue(undefined);
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([threads[0]]);

		const onSelectThread = vi.fn();
		const onThreadsUpdate = vi.fn();

		render(
			<NavThreads
				threads={threads}
				activeThreadId="thread-1"
				onSelectThread={onSelectThread}
				onThreadsUpdate={onThreadsUpdate}
			/>,
		);

		// Open delete dialog for second thread - click the second dropdown item
		const deleteButtons = screen.getAllByText('Delete');
		fireEvent.click(deleteButtons[1]);

		// Confirm delete
		const confirmButton = screen.getByTestId('alert-action');
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(apiClient.deleteThread).toHaveBeenCalledWith('thread-2');
			expect(onSelectThread).not.toHaveBeenCalled();
		});
	});
});
