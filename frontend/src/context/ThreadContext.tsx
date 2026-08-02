import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { type ThreadMetadata } from "@/api/client";

interface ThreadContextType {
	activeThreadId: string | null;
	setActiveThreadId: (id: string | null) => void;
	activeThreadTitle: string;
	setActiveThreadTitle: (title: string) => void;
	threads: ThreadMetadata[];
	setThreads: React.Dispatch<React.SetStateAction<ThreadMetadata[]>>;
	currentIdeaTitle: string | undefined;
	setCurrentIdeaTitle: (title: string | undefined) => void;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export function ThreadProvider({ children }: { children: ReactNode }) {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [activeThreadTitle, setActiveThreadTitle] = useState<string>("Agent Team Chat");
	const [threads, setThreads] = useState<ThreadMetadata[]>([]);
	const [currentIdeaTitle, setCurrentIdeaTitle] = useState<string | undefined>();

	const value = useMemo(
		() => ({
			activeThreadId,
			setActiveThreadId,
			activeThreadTitle,
			setActiveThreadTitle,
			threads,
			setThreads,
			currentIdeaTitle,
			setCurrentIdeaTitle,
		}),
		[activeThreadId, activeThreadTitle, threads, currentIdeaTitle],
	);

	return <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>;
}

export function useThreadContext() {
	const ctx = useContext(ThreadContext);
	if (!ctx) {
		throw new Error("useThreadContext must be used within a ThreadProvider");
	}
	return ctx;
}
