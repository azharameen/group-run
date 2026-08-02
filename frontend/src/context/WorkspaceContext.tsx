import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";

interface WorkspaceContextType {
	isWorkspaceOpen: boolean;
	setIsWorkspaceOpen: React.Dispatch<React.SetStateAction<boolean>>;
	toggleWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(true);

	const toggleWorkspace = useCallback(() => setIsWorkspaceOpen((prev) => !prev), []);

	const value = useMemo(
		() => ({
			isWorkspaceOpen,
			setIsWorkspaceOpen,
			toggleWorkspace,
		}),
		[isWorkspaceOpen, toggleWorkspace],
	);

	return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
	const ctx = useContext(WorkspaceContext);
	if (!ctx) {
		throw new Error("useWorkspaceContext must be used within a WorkspaceProvider");
	}
	return ctx;
}
