import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
	listThreads,
	createThread,
	updateThread,
	deleteThread,
	type ThreadMetadata,
	type UpdateThreadRequest,
} from "@/api/client";

interface UseThreadManagerOptions {
	activeThreadId: string | null;
	setActiveThreadId: (id: string | null) => void;
	onActiveThreadTitleChange: (title: string) => void;
	onThreadsUpdate: (threads: ThreadMetadata[]) => void;
	threads: ThreadMetadata[];
}

export function useThreadManager({
	activeThreadId,
	setActiveThreadId,
	onActiveThreadTitleChange,
	onThreadsUpdate,
	threads,
}: UseThreadManagerOptions) {
	const activeThreadIdRef = useRef(activeThreadId);
	activeThreadIdRef.current = activeThreadId;

	const activeThread = useMemo(
		() => threads.find((t) => t.thread_id === activeThreadId) ?? null,
		[threads, activeThreadId],
	);

	// Sync active thread title with parent context
	useEffect(() => {
		if (activeThread) {
			onActiveThreadTitleChange(activeThread.title);
		} else {
			onActiveThreadTitleChange("Agent Team Chat");
		}
	}, [activeThread, onActiveThreadTitleChange]);

	// Fetch initial threads list on mount (one-time only)
	const initialized = useRef(false);
	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;
		listThreads()
			.then((allThreads) => {
				onThreadsUpdate(allThreads);
				if (allThreads.length > 0 && !activeThreadId) {
					setActiveThreadId(allThreads[0].thread_id);
				}
			})
			.catch((err) => console.error("Error fetching threads:", err));
	}, [onThreadsUpdate, activeThreadId, setActiveThreadId]);

	const refreshThreads = useCallback(() => {
		listThreads()
			.then(onThreadsUpdate)
			.catch((err) => console.error("Error refreshing threads:", err));
	}, [onThreadsUpdate]);

	const ensureThread = useCallback(async (): Promise<string> => {
		if (activeThreadIdRef.current) return activeThreadIdRef.current;
		const thread = await createThread({
			title: "New Chat",
			idea_id: null,
		});
		// Refresh from server to get authoritative state
		await refreshThreads();
		setActiveThreadId(thread.thread_id);
		return thread.thread_id;
	}, [refreshThreads, setActiveThreadId]);

	const updateThreadById = useCallback(
		async (threadId: string, updates: UpdateThreadRequest): Promise<ThreadMetadata> => {
			const updated = await updateThread(threadId, updates);
			await refreshThreads();
			return updated;
		},
		[refreshThreads],
	);

	const deleteThreadById = useCallback(
		async (threadId: string): Promise<void> => {
			await deleteThread(threadId);
			// Switch away if the deleted thread was active
			if (activeThreadIdRef.current === threadId) {
				setActiveThreadId(null);
			}
			await refreshThreads();
		},
		[refreshThreads, setActiveThreadId],
	);

	return {
		activeThread,
		ensureThread,
		refreshThreads,
		updateThread: updateThreadById,
		deleteThread: deleteThreadById,
	};
}
