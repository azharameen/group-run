import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { RightChatSidebar } from "@/components/RightChatSidebar";
import { SiteHeader } from "@/components/site-header";
import Dashboard from "./pages/Dashboard";
import IdeaDetail from "./pages/IdeaDetail";
import KnowledgeBase from "./pages/KnowledgeBase";
import SiemensControls from "./pages/SiemensControls";

export default function App() {
	const [currentIdeaTitle, setCurrentIdeaTitle] = useState<
		string | undefined
	>();
	const [isChatOpen, setIsChatOpen] = useState<boolean>(true);

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col h-svh overflow-hidden min-w-0">
				<SiteHeader
					ideaTitle={currentIdeaTitle}
					isChatOpen={isChatOpen}
					onToggleChat={() => setIsChatOpen((prev) => !prev)}
				/>
				<main className="flex-1 overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto">
					<Routes>
						<Route path="/" element={<Dashboard />} />
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
				</main>
			</SidebarInset>
			{isChatOpen && <RightChatSidebar onClose={() => setIsChatOpen(false)} />}
		</SidebarProvider>
	);
}
