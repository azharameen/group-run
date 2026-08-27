import * as React from "react";
import { Link } from "react-router-dom";
import { BarChart3, Database, Bot, Building2 } from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { NavThreads } from "@/components/nav-threads";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { type ThreadMetadata } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useThreadContext } from "@/context/ThreadContext";

const data = {
	navMain: [
		{
			title: "Home",
			url: "/",
			icon: Bot,
		},
		{
			title: "Ideas",
			url: "/ideas",
			icon: BarChart3,
		},
		{
			title: "Knowledge Base",
			url: "/knowledge-base",
			icon: Database,
		},
		{
			title: "Organization",
			url: "/organization",
			icon: Building2,
		},
	],
};

export function AppSidebar({
	threads: propsThreads,
	activeThreadId: propsActiveThreadId,
	onSelectThread: propsOnSelectThread,
	onThreadsUpdate: propsOnThreadsUpdate,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	threads?: ThreadMetadata[];
	activeThreadId?: string | null;
	onSelectThread?: (threadId: string | null) => void;
	onThreadsUpdate?: (threads: ThreadMetadata[]) => void;
}) {
	const { user } = useAuth();
	let threadCtx: ReturnType<typeof useThreadContext> | null = null;
	try {
		threadCtx = useThreadContext();
	} catch {
		threadCtx = null;
	}

	const threads = propsThreads ?? threadCtx?.threads ?? [];
	const activeThreadId = propsActiveThreadId ?? threadCtx?.activeThreadId ?? null;
	const onSelectThread = propsOnSelectThread ?? threadCtx?.setActiveThreadId;
	const onThreadsUpdate = propsOnThreadsUpdate ?? threadCtx?.setThreads;

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild tooltip="Companion">
							<Link to="/">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
									<Bot className="size-5" />
								</div>
								<div className="hidden group-data-[state=expanded]:grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">Companion</span>
									<span className="truncate text-xs text-muted-foreground">
										Companion Engine
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
				<NavMain items={data.navMain} />
			</SidebarHeader>
			<SidebarContent className="flex-1 min-h-0 overflow-hidden p-0">
				<NavThreads
					threads={threads}
					activeThreadId={activeThreadId}
					onSelectThread={onSelectThread}
					onThreadsUpdate={onThreadsUpdate}
				/>
			</SidebarContent>
			<SidebarFooter>
				<NavUser
					user={{
						name: user?.display_name || "Companion user",
						email: user?.email || "",
						avatar: user?.photo_url || "",
					}}
				/>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
