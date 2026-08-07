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
		vi.spyOn(apiClient, 'listThreads').mockResolvedValue([]);
		const createSpy = vi.spyOn(apiClient, 'createThread');

		const { result } = renderHook(() =>
			useThreadManager({
				activeThreadId: 'existing-thread',
				setActiveThreadId: vi.fn(),
				onActiveThreadTitleChange: vi.fn(),
				onThreadsUpdate: vi.fn(),
				threads: [],
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

		let returned: ThreadMetadata = null as any;
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
});
