import * as React from "react";
import { useLocation, Link } from "react-router-dom";
import { Moon, Sun, Search, MessageSquare } from "lucide-react";

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
	const [darkMode, setDarkMode] = React.useState(false);

	const toggleTheme = () => {
		const isDark = !darkMode;
		setDarkMode(isDark);
		if (isDark) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	};

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
				<div className="relative hidden md:block w-48 lg:w-64">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search ideas or patents..."
						className="pl-8 h-9 bg-muted/50 text-xs rounded-lg border-muted"
					/>
				</div>

				<Button
					variant="ghost"
					size="icon"
					onClick={toggleTheme}
					title="Toggle theme"
					className="h-8 w-8 rounded-lg"
				>
					{darkMode ? (
						<Sun className="h-4 w-4 text-amber-500" />
					) : (
						<Moon className="h-4 w-4 text-slate-600" />
					)}
					<span className="sr-only">Toggle theme</span>
				</Button>

				{onToggleChat && (
					<Button
						variant={isChatOpen ? "default" : "ghost"}
						size="icon"
						onClick={onToggleChat}
						title="Toggle Agent Team Chat Sidebar"
						className="h-8 w-8 rounded-lg"
					>
						<MessageSquare className="h-4 w-4" />
						<span className="sr-only">Toggle Agent Chat Sidebar</span>
					</Button>
				)}
			</div>
		</header>
	);
}
