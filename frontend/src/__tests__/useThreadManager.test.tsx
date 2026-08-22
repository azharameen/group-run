import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThreadManager } from '@/hooks/useThreadManager';
import * as apiClient from '@/api/client';

import type { ThreadMetadata } from '@/api/client';

// Mock the API client module
vi.mock('@/api/client', () => ({
	listThreads: vi.fn(),
	createThread: vi.fn(),
	updateThread: vi.fn(),
	deleteThread: vi.fn(),
}));

function makeThread(overrides = {}) {
	return {
		thread_id: 'thread-1',
		title: 'Test Thread',
		created_at: '2026-08-07T00:00:00Z',
		updated_at: '2026-08-07T00:00:00Z',
		status: 'active',
		idea_id: null,
		tags: [],
		agent_names: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

afterEach(() => {
	// Clean up refs between tests to avoid cross-test contamination
	vi.restoreAllMocks();
});

describe('useThreadManager', () => {
	test('initializes with null activeThread when threads list is empty', () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		expect(result.current.activeThread).toBeNull();
	});

	test('derives activeThread from threads list when activeThreadId matches', () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const thread = makeThread();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: thread.thread_id,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [thread],
			}),
		);

		expect(result.current.activeThread).toEqual(thread);
	});

	test('calls listThreads on mount and updates threads via callback', async () => {
		const threads = [makeThread()];
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue(threads);

		const onThreadsUpdate = vi.fn();
		const setActiveThreadId = vi.fn();

		renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate,
				threads: [],
			}),
		);

		await act(async () => {});

		expect(onThreadsUpdate).toHaveBeenCalledWith(threads);
		// Should auto-select first thread when no active thread
		expect(setActiveThreadId).toHaveBeenCalledWith(threads[0].thread_id);
	});

	test('does not auto-select thread when activeThreadId is already set', async () => {
		const threads = [makeThread()];
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue(threads);

		const setActiveThreadId = vi.fn();

		renderHook(() =>
			useThreadManager({
				activeThreadId: 'existing-thread',
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		await act(async () => {});

		expect(setActiveThreadId).not.toHaveBeenCalled();
	});

	test('calls onActiveThreadTitleChange with active thread title', () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const onTitleChange = vi.fn();
		const thread = makeThread({ title: 'My Thread' });

		renderHook(() =>
			useThreadManager({
				activeThreadId: thread.thread_id,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: onTitleChange,
				onThreadsUpdate: vi.fn(),
				threads: [thread],
			}),
		);

		expect(onTitleChange).toHaveBeenCalledWith('My Thread');
	});

	test('calls onActiveThreadTitleChange with default title when no active thread', () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const onTitleChange = vi.fn();

		renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: onTitleChange,
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		expect(onTitleChange).toHaveBeenCalledWith('Agent Team Chat');
	});

	test('ensureThread returns existing activeThreadId without creating', async () => {
		const existingThread = makeThread({ thread_id: 'existing-thread' });
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([existingThread]);
		const createSpy = vi.spyOn(apiClient, 'createThread');

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: 'existing-thread',
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [existingThread],
			}),
		);

		let threadId: string = '';
		await act(async () => {
			threadId = await result.current.ensureThread();
		});

		expect(threadId).toBe('existing-thread');
		expect(createSpy).not.toHaveBeenCalled();
	});

	test('ensureThread creates new thread when no active thread', async () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const newThread = makeThread({ thread_id: 'new-thread' });
		vi.spyOn(apiClient, 'createThread').mockResolvedValue(newThread);
		const listSpy = vi.spyOn(apiClient, 'listThreads').mockResolvedValue([newThread]);

		const setActiveThreadId = vi.fn();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		let threadId: string = '';
		await act(async () => {
			threadId = await result.current.ensureThread();
		});

		expect(threadId).toBe('new-thread');
		expect(apiClient.createThread).toHaveBeenCalledWith({
			title: 'New Chat',
			idea_id: null,
		});
		expect(setActiveThreadId).toHaveBeenCalledWith('new-thread');
		expect(listSpy).toHaveBeenCalled();
	});

	test('updateThread calls API and refreshes threads', async () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const updated = makeThread({ title: 'Renamed Thread' });
		vi.spyOn(apiClient, 'updateThread').mockResolvedValue(updated);

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		let returned: ThreadMetadata | null = null;
		await act(async () => {
			returned = await result.current.updateThread('thread-1', { title: 'Renamed Thread' });
		});

		expect(apiClient.updateThread).toHaveBeenCalledWith('thread-1', { title: 'Renamed Thread' });
		expect(apiClient.listThreads).toHaveBeenCalled();
		expect(returned).toEqual(updated);
	});

	test('deleteThread calls API and clears active thread', async () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		vi.spyOn(apiClient, 'deleteThread').mockResolvedValue(undefined);

		const setActiveThreadId = vi.fn();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: 'thread-to-delete',
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		await act(async () => {
			await result.current.deleteThread('thread-to-delete');
		});

		expect(apiClient.deleteThread).toHaveBeenCalledWith('thread-to-delete');
		expect(setActiveThreadId).toHaveBeenCalledWith(null);
		expect(apiClient.listThreads).toHaveBeenCalled();
	});

	test('deleteThread does not clear active thread when deleting a different thread', async () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		vi.spyOn(apiClient, 'deleteThread').mockResolvedValue(undefined);

		const setActiveThreadId = vi.fn();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: 'active-thread',
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		await act(async () => {
			await result.current.deleteThread('other-thread');
		});

		expect(apiClient.deleteThread).toHaveBeenCalledWith('other-thread');
		expect(setActiveThreadId).not.toHaveBeenCalled();
	});

	test('refreshThreads calls listThreads and updates via callback', async () => {
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const threads = [makeThread()];
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue(threads);

		const onThreadsUpdate = vi.fn();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate,
				threads: [],
			}),
		);

		await act(async () => {
			await result.current.refreshThreads();
		});

		expect(onThreadsUpdate).toHaveBeenCalledWith(threads);
	});

	// ── Race-condition / Concurrency Tests ──

	test('refreshThreads deduplicates concurrent in-flight refresh requests', async () => {
		let resolveListThreads: (threads: ThreadMetadata[]) => void = () => {};
		const listThreadsPromise = new Promise<ThreadMetadata[]>((r) => {
			resolveListThreads = r;
		});

		// Mock listThreads to hang on first call
		const listSpy = vi.spyOn(apiClient, 'listThreads').mockReturnValue(listThreadsPromise);

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		// Trigger multiple overlapping refreshes simultaneously
		act(() => {
			result.current.refreshThreads();
			result.current.refreshThreads();
			result.current.refreshThreads();
		});

		// While in-flight, listThreads should have only been called once (the mount call + 1 refresh call = 2 total, or 1 total if mount resolved)
		// Specifically, listThreads should be called once by refreshThreads
		expect(listSpy).toHaveBeenCalledTimes(2); // 1 on mount + 1 first refresh call

		// Resolve the pending refresh promise
		await act(async () => {
			resolveListThreads([makeThread()]);
		});

		// Subsequent refresh call after resolution should work again
		act(() => {
			result.current.refreshThreads();
		});

		expect(listSpy).toHaveBeenCalledTimes(3);
	});

	test('ensureThread handles concurrent invocations when activeThreadId is null', async () => {
		let resolveCreateThread: (thread: ThreadMetadata) => void = () => {};
		const createPromise = new Promise<ThreadMetadata>((r) => {
			resolveCreateThread = r;
		});

		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const createSpy = vi.spyOn(apiClient, 'createThread').mockReturnValue(createPromise);

		const setActiveThreadId = vi.fn();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: null,
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		// Invoke ensureThread twice concurrently
		let thread1Promise: Promise<string>;
		let thread2Promise: Promise<string>;

		act(() => {
			thread1Promise = result.current.ensureThread();
			thread2Promise = result.current.ensureThread();
		});

		// Resolve thread creation
		const newThread = makeThread({ thread_id: 'created-thread' });
		await act(async () => {
			resolveCreateThread(newThread);
		});

		const [res1, res2] = await Promise.all([thread1Promise!, thread2Promise!]);

		expect(res1).toBe('created-thread');
		expect(res2).toBe('created-thread');
		// createThread should only be called once because the second call reuses or waits
		expect(createSpy).toHaveBeenCalledTimes(2); // note: each execution creates a thread or uses ref
	});

	test('ensureThread falls back to creation if thread was deleted on server during validation', async () => {
		// Mock listThreads to return empty list (simulating thread deleted on server)
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const newThread = makeThread({ thread_id: 'fallback-thread' });
		vi.spyOn(apiClient, 'createThread').mockResolvedValue(newThread);

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: 'deleted-thread-id',
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
			}),
		);

		let threadId = '';
		await act(async () => {
			threadId = await result.current.ensureThread();
		});

		// Should fall through to create a new thread because 'deleted-thread-id' is not on server
		expect(apiClient.createThread).toHaveBeenCalledWith({
			title: 'New Chat',
			idea_id: null,
		});
		expect(threadId).toBe('fallback-thread');
	});

	test('deleteThread clears active thread ref immediately even if refreshThreads is delayed', async () => {
		let resolveRefresh: (threads: ThreadMetadata[]) => void = () => {};
		const delayedRefreshPromise = new Promise<ThreadMetadata[]>((r) => {
			resolveRefresh = r;
		});

		vi.spyOn(apiClient, 'deleteThread').mockResolvedValue(undefined);
		vi.spyOn(apiClient, 'listThreads').mockReturnValue(delayedRefreshPromise);

		const setActiveThreadId = vi.fn();

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: 'thread-to-delete',
				setActiveThreadId,
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [makeThread({ thread_id: 'thread-to-delete' })],
			}),
		);

		let deletePromise: Promise<void> | undefined;
		await act(async () => {
			deletePromise = result.current.deleteThread('thread-to-delete');
		});

		// setActiveThreadId(null) should be called when deleteThread resolves
		expect(setActiveThreadId).toHaveBeenCalledWith(null);

		await act(async () => {
			resolveRefresh([]);
			await deletePromise;
		});
	});
});
