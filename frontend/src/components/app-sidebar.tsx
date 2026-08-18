import * as React from "react";
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

const data = {
	user: {
		name: "Engineer",
		email: "engineer@companion.ai",
		avatar: "/avatars/user.jpg",
	},
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
	threads = [],
	activeThreadId,
	onSelectThread,
	onThreadsUpdate,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	threads?: ThreadMetadata[];
	activeThreadId?: string | null;
	onSelectThread?: (threadId: string | null) => void;
	onThreadsUpdate?: (threads: ThreadMetadata[]) => void;
}) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild tooltip="Companion">
							<a href="/">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
									<Bot className="size-5" />
								</div>
								<div className="hidden group-data-[state=expanded]:grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">Companion</span>
									<span className="truncate text-xs text-muted-foreground">
										Companion Engine
									</span>
								</div>
							</a>
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
				<NavUser user={data.user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
