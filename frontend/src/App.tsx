import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThreadProvider, useThreadContext } from "@/context/ThreadContext";
import { WorkspaceProvider, useWorkspaceContext } from "@/context/WorkspaceContext";

const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const IdeaDetail = lazy(() => import("./pages/IdeaDetail"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const SiemensControls = lazy(() => import("./pages/SiemensControls"));

function AppContent() {
	const {
		activeThreadId,
		setActiveThreadId,
		activeThreadTitle,
		setActiveThreadTitle,
		threads,
		setThreads,
		currentIdeaTitle,
		setCurrentIdeaTitle,
	} = useThreadContext();

	const { isWorkspaceOpen, toggleWorkspace } = useWorkspaceContext();

	return (
		<SidebarProvider defaultOpen={false}>
			<AppSidebar
				threads={threads}
				activeThreadId={activeThreadId}
				onSelectThread={setActiveThreadId}
				onThreadsUpdate={setThreads}
			/>
			<SidebarInset className="flex flex-col h-svh overflow-hidden min-w-0">
				<SiteHeader
					ideaTitle={currentIdeaTitle}
					activeThreadId={activeThreadId}
					activeThreadTitle={activeThreadTitle}
					threads={threads}
					onSelectThread={setActiveThreadId}
					onThreadsUpdate={setThreads}
					isWorkspaceOpen={isWorkspaceOpen}
					onToggleWorkspace={toggleWorkspace}
				/>
				<main className="flex-1 overflow-hidden">
					<Suspense fallback={<PageSkeleton />}>
						<Routes>
							<Route
								path="/"
								element={
									<CommandCenter
										activeThreadId={activeThreadId}
										setActiveThreadId={setActiveThreadId}
										onActiveThreadTitleChange={setActiveThreadTitle}
										onThreadsUpdate={setThreads}
										threads={threads}
										isWorkspaceOpen={isWorkspaceOpen}
									/>
								}
							/>
							<Route path="/ideas" element={<Dashboard />} />
							<Route
								path="/ideas/:ideaId"
								element={
									<IdeaDetail
										onIdeaLoaded={(title) => setCurrentIdeaTitle(title)}
									/>
								}
							/>
							<Route path="/knowledge-base" element={<KnowledgeBase />} />
							<Route path="/siemens-controls" element={<SiemensControls />} />
							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>
					</Suspense>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function App() {
	return (
		<ErrorBoundary>
			<ThreadProvider>
				<WorkspaceProvider>
					<AppContent />
				</WorkspaceProvider>
			</ThreadProvider>
		</ErrorBoundary>
	);
}
