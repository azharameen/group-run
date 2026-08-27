import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProtectedRoute } from "@/components/protected-route";
import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThreadProvider, useThreadContext } from "@/context/ThreadContext";
import {
	WorkspaceProvider,
} from "@/context/WorkspaceContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { trackEvent } from "@/lib/firebase";

const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const IdeaDetail = lazy(() => import("./pages/IdeaDetail"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Organization = lazy(() => import("./pages/Organization"));
const SignIn = lazy(() => import("./pages/SignIn"));

function AppContent() {
	const location = useLocation();
	const { currentIdeaTitle, setCurrentIdeaTitle } = useThreadContext();

	useEffect(() => {
		trackEvent("page_view", { page_path: location.pathname });
	}, [location.pathname]);

	return (
		<SidebarProvider defaultOpen={false} className="flex h-full">
			<AppSidebar />
			<SidebarInset className="flex flex-col h-full overflow-hidden">
				<SiteHeader ideaTitle={currentIdeaTitle} />
				<main className="flex-1 overflow-y-auto pt-0">
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
							<Route path="/" element={<CommandCenter />} />
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
							<Route path="/organization" element={<Organization />} />
							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>
					</Suspense>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}

function ProtectedApp() {
	return (
		<RealtimeProvider>
			<ThreadProvider>
				<WorkspaceProvider>
					<AppContent />
				</WorkspaceProvider>
			</ThreadProvider>
		</RealtimeProvider>
	);
}

export default function App() {
	return (
		<ErrorBoundary>
			<Suspense fallback={<div className="min-h-svh bg-background" />}>
				<Routes>
					<Route path="/sign-in" element={<SignIn />} />
					<Route element={<ProtectedRoute />}>
						<Route path="/*" element={<ProtectedApp />} />
					</Route>
				</Routes>
			</Suspense>
		</ErrorBoundary>
	);
}
