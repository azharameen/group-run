import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { MessageSquare, Plus, ChevronDown, Folder, Search, PanelRight } from "lucide-react";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { createThread, listThreads, type ThreadMetadata } from "@/api/client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function SiteHeader({
	ideaTitle,
	activeThreadId,
	activeThreadTitle,
	threads = [],
	onSelectThread,
	onThreadsUpdate,
	isWorkspaceOpen = true,
	onToggleWorkspace,
}: {
	ideaTitle?: string;
	activeThreadId?: string | null;
	activeThreadTitle?: string;
	threads?: ThreadMetadata[];
	onSelectThread?: (threadId: string) => void;
	onThreadsUpdate?: (threads: ThreadMetadata[]) => void;
	isWorkspaceOpen?: boolean;
	onToggleWorkspace?: () => void;
}) {
	const location = useLocation();
	const path = location.pathname;
	const [threadSearch, setThreadSearch] = useState("");

	const handleCreateNewThread = async () => {
		try {
			const thread = await createThread({ title: "New Chat" });
			if (onSelectThread) onSelectThread(thread.thread_id);
			const allThreads = await listThreads();
			if (onThreadsUpdate) onThreadsUpdate(allThreads);
		} catch {}
	};

	const filteredThreads = threads.filter((t) =>
		t.title.toLowerCase().includes(threadSearch.toLowerCase()),
	);

	return (
		<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b bg-background/95 backdrop-blur px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
			<div className="flex items-center gap-2">
				<SidebarTrigger className="-ml-1" />
				<Separator orientation="vertical" className="mr-2 h-4" />

				{path === "/" ? (
					<span className="font-semibold text-sm truncate text-foreground">
						{activeThreadTitle || "Agent Team Chat"}
					</span>
				) : (
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link to="/">Home</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>

							{path === "/ideas" && (
								<>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Ideas</BreadcrumbPage>
									</BreadcrumbItem>
								</>
							)}

							{path.startsWith("/ideas/") && (
								<>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link to="/ideas">Ideas</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage
											className="max-w-[280px] truncate"
										>
											{ideaTitle || "Idea Details"}
										</BreadcrumbPage>
									</BreadcrumbItem>
								</>
							)}

							{path === "/knowledge-base" && (
								<>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Knowledge Base</BreadcrumbPage>
									</BreadcrumbItem>
								</>
							)}

							{path === "/siemens-controls" && (
								<>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Siemens Controls</BreadcrumbPage>
									</BreadcrumbItem>
								</>
							)}
						</BreadcrumbList>
					</Breadcrumb>
				)}
			</div>

			{path === "/" && (
				<div className="ml-auto flex items-center gap-2">
					{/* Attached Control Group: Threads Select + New Thread Add Button */}
					<div className="flex items-center">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="h-8 text-xs gap-1.5 border-muted-foreground/20 font-medium rounded-r-none border-r-0 max-w-[180px] sm:max-w-[240px]"
								>
									<MessageSquare className="w-3.5 h-3.5 text-primary shrink-0" />
									<span className="truncate">{activeThreadTitle || "Select Thread"}</span>
									<ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-64 max-h-80 flex flex-col p-0">
								<div className="p-2 border-b">
									<div className="relative">
										<Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											type="search"
											placeholder="Search threads..."
											value={threadSearch}
											onChange={(e) => setThreadSearch(e.target.value)}
											className="pl-7 h-7 text-xs bg-background"
										/>
									</div>
								</div>
								<div className="p-1 overflow-y-auto max-h-60">
									{filteredThreads.length === 0 ? (
										<div className="px-2 py-3 text-[11px] text-center text-muted-foreground">
											No matching threads.
										</div>
									) : (
										filteredThreads.map((t) => (
											<DropdownMenuItem
												key={t.thread_id}
												onClick={() => onSelectThread?.(t.thread_id)}
												className={`flex flex-col items-start gap-0.5 text-xs py-1.5 cursor-pointer ${
													t.thread_id === activeThreadId ? "bg-accent font-semibold" : ""
												}`}
											>
												<div className="truncate w-full">{t.title}</div>
												<div className="text-[9.5px] text-muted-foreground">
													{new Date(t.updated_at).toLocaleString()}
												</div>
											</DropdownMenuItem>
										))
									)}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									onClick={handleCreateNewThread}
									className="h-8 w-8 p-0 border-muted-foreground/20 rounded-l-none"
								>
									<Plus className="w-3.5 h-3.5 text-primary" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								Create new thread
							</TooltipContent>
						</Tooltip>
					</div>

					{onToggleWorkspace && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={onToggleWorkspace}
									className="h-8 w-8 border-muted-foreground/20 shrink-0"
								>
									<PanelRight className={`w-3.5 h-3.5 ${isWorkspaceOpen ? "text-primary" : "text-muted-foreground"}`} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								{isWorkspaceOpen ? "Close workspace" : "Open workspace"}
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</header>
	);
}
