import { useLocation, Link } from "react-router-dom";
import { BotMessageSquare } from "lucide-react";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({
	ideaTitle,
	onToggleChat,
	isChatOpen = true,
}: {
	ideaTitle?: string;
	onToggleChat?: () => void;
	isChatOpen?: boolean;
}) {
	const location = useLocation();

	// Determine breadcrumb structure
	const path = location.pathname;

	return (
		<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
			<div className="flex items-center gap-2">
				<SidebarTrigger className="-ml-1" />
				<Separator orientation="vertical" className="mr-2 h-4" />
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/">Dashboard</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>

						{path.startsWith("/ideas") && (
							<>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage
										className="max-w-[280px] truncate"
										title={ideaTitle}
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
			</div>

			<div className="ml-auto flex items-center gap-2">
				{onToggleChat && (
					<Button
						variant="ghost"
						size="icon"
						onClick={onToggleChat}
						title="Toggle Agent Team Chat Sidebar"
						className="h-8 w-8 rounded-lg"
					>
						<BotMessageSquare className="h-4 w-4" />
						<span className="sr-only">Toggle Agent Chat Sidebar</span>
					</Button>
				)}
			</div>
		</header>
	);
}
