import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThreadProvider, useThreadContext } from "@/context/ThreadContext";
import {
	WorkspaceProvider,
	useWorkspaceContext,
} from "@/context/WorkspaceContext";

const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const IdeaDetail = lazy(() => import("./pages/IdeaDetail"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));

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
			<SidebarInset>
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
				<main className="flex-1 flex flex-col p-4 pt-0">
					<Suspense
						fallback={
							<div className="h-full w-full p-6 space-y-6 animate-pulse">
								<div className="flex items-center justify-between">
									<Skeleton className="h-8 w-48 rounded-md" />
									<Skeleton className="h-8 w-24 rounded-md" />
								</div>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<Skeleton className="h-28 rounded-xl" />
									<Skeleton className="h-28 rounded-xl" />
									<Skeleton className="h-28 rounded-xl" />
								</div>
								<Skeleton className="h-64 w-full rounded-xl" />
							</div>
						}
					>
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
