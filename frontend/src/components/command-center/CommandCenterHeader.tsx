import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Plus, Layers, BotMessageSquare, Check } from "lucide-react";
import type { ThreadMetadata } from "@/api/client";

interface CommandCenterHeaderProps {
	activeThreadId: string | null;
	activeThreadTitle: string;
	threads: ThreadMetadata[];
	onSelectThread: (id: string | null) => void;
	onCreateNewThread: () => void;
	isWorkspaceOpen: boolean;
	onToggleWorkspace: () => void;
}

export function CommandCenterHeader({
	activeThreadId,
	activeThreadTitle,
	threads,
	onSelectThread,
	onCreateNewThread,
	isWorkspaceOpen,
	onToggleWorkspace,
}: CommandCenterHeaderProps) {
	return (
		<div className="border-b px-4 h-14 flex items-center justify-between bg-sidebar shrink-0">
			<div className="flex items-center gap-3 min-w-0">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="h-9 px-3 gap-2 text-sm font-semibold hover:bg-muted/50 max-w-[280px] sm:max-w-[360px]"
						>
							<BotMessageSquare className="w-4 h-4 text-primary shrink-0" />
							<span className="truncate">{activeThreadTitle || "Agent Team Chat"}</span>
							<ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 ml-auto" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
						<div className="p-2 border-b">
							<Button
								variant="outline"
								size="sm"
								className="w-full justify-start gap-2 text-xs"
								onClick={onCreateNewThread}
							>
								<Plus className="w-3.5 h-3.5" />
								New Chat Thread
							</Button>
						</div>
						<div className="p-1">
							{threads.length === 0 ? (
								<div className="p-3 text-center text-xs text-muted-foreground">
									No threads yet
								</div>
							) : (
								threads.map((t) => (
									<DropdownMenuItem
										key={t.thread_id}
										onClick={() => onSelectThread(t.thread_id)}
										className="flex items-center justify-between text-xs py-2 cursor-pointer"
									>
										<span className="truncate pr-2 font-medium">{t.title}</span>
										{t.thread_id === activeThreadId && (
											<Check className="w-3.5 h-3.5 text-primary shrink-0" />
										)}
									</DropdownMenuItem>
								))
							)}
						</div>
					</DropdownMenuContent>
				</DropdownMenu>

				<Badge variant="outline" className="text-[10px] font-mono gap-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
					<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
					Agent Swarm Active
				</Badge>
			</div>

			<div className="flex items-center gap-2">
				<Button
					variant={isWorkspaceOpen ? "secondary" : "ghost"}
					size="sm"
					onClick={onToggleWorkspace}
					className="h-8 text-xs gap-1.5"
				>
					<Layers className="w-3.5 h-3.5" />
					Workspace Pane
				</Button>
			</div>
		</div>
	);
}
