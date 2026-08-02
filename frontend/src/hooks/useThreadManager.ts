import { useState, useEffect, useCallback, useMemo } from "react";
import { listThreads, createThread, type ThreadMetadata } from "@/api/client";

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

	// Fetch initial threads list on mount if empty
	useEffect(() => {
		listThreads()
			.then((allThreads) => {
				onThreadsUpdate(allThreads);
				if (allThreads.length > 0 && !activeThreadId) {
					setActiveThreadId(allThreads[0].thread_id);
				}
			})
			.catch((err) => console.error("Error fetching threads:", err));
	}, [onThreadsUpdate, activeThreadId, setActiveThreadId]);

	const ensureThread = useCallback(async (): Promise<string> => {
		if (activeThreadId) return activeThreadId;
		const thread = await createThread({
			title: "New Chat",
			idea_id: null,
		});
		onThreadsUpdate([...threads, thread]);
		setActiveThreadId(thread.thread_id);
		return thread.thread_id;
	}, [activeThreadId, threads, onThreadsUpdate, setActiveThreadId]);

	const refreshThreads = useCallback(() => {
		listThreads()
			.then(onThreadsUpdate)
			.catch((err) => console.error("Error refreshing threads:", err));
	}, [onThreadsUpdate]);

	return {
		activeThread,
		ensureThread,
		refreshThreads,
	};
}
