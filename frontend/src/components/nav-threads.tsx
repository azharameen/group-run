import * as React from "react";
import { useState } from "react";
import {
	MessageSquare,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
	Search,
} from "lucide-react";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarMenuAction,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	createThread,
	updateThread,
	deleteThread,
	listThreads,
	type ThreadMetadata,
} from "@/api/client";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

export function NavThreads({
	threads = [],
	activeThreadId,
	onSelectThread,
	onThreadsUpdate,
}: {
	threads?: ThreadMetadata[];
	activeThreadId?: string | null;
	onSelectThread?: (threadId: string | null) => void;
	onThreadsUpdate?: (threads: ThreadMetadata[]) => void;
}) {
	const { state, isMobile } = useSidebar();
	const isRail = state === "collapsed" && !isMobile;
	const [searchQuery, setSearchQuery] = useState("");

	// Rename Modal state
	const [renameTarget, setRenameTarget] = useState<ThreadMetadata | null>(null);
	const [renameTitle, setRenameTitle] = useState("");
	const [isRenameOpen, setIsRenameOpen] = useState(false);

	// Delete Modal state
	const [deleteTarget, setDeleteTarget] = useState<ThreadMetadata | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);

	const { toast } = useToast();

	const openRenameDialog = (t: ThreadMetadata) => {
		setRenameTarget(t);
		setRenameTitle(t.title);
		setIsRenameOpen(true);
	};

	const confirmRename = async () => {
		if (!renameTarget || !renameTitle.trim()) return;
		try {
			await updateThread(renameTarget.thread_id, { title: renameTitle.trim() });
			const allThreads = await listThreads();
			if (onThreadsUpdate) onThreadsUpdate(allThreads);
		} catch (err) {
			console.error("Failed to rename thread", err);
		} finally {
			setIsRenameOpen(false);
			setRenameTarget(null);
		}
	};

	const openDeleteDialog = (t: ThreadMetadata) => {
		setDeleteTarget(t);
		setIsDeleteOpen(true);
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		try {
			await deleteThread(deleteTarget.thread_id);
			if (activeThreadId === deleteTarget.thread_id && onSelectThread) {
				onSelectThread(null);
			}
			const allThreads = await listThreads();
			if (onThreadsUpdate) onThreadsUpdate(allThreads);
		} catch (err) {
			console.error("Failed to delete thread", err);
		} finally {
			setIsDeleteOpen(false);
			setDeleteTarget(null);
		}
	};

	const createNewThread = async () => {
		setIsCreating(true);
		try {
			const thread = await createThread({ title: "New Chat", idea_id: null });
			if (onSelectThread) onSelectThread(thread.thread_id);
			try {
				const allThreads = await listThreads();
				if (onThreadsUpdate) onThreadsUpdate(allThreads);
			} catch (refreshErr) {
				// List refresh failed — optimistic update keeps UI consistent.
				console.error("Failed to refresh thread list after create", refreshErr);
				toast({ variant: "destructive", title: "Refresh failed", description: "Thread created, but list refresh failed. The thread may not appear until you refresh the page." });
			}
		} catch (err) {
			console.error("Failed to create thread", err);
			toast({ variant: "destructive", title: "Failed to create thread", description: "Please try again." });
		} finally {
			setIsCreating(false);
		}
	};

	// On Desktop Rail Mode (collapsed & not mobile), hide threads group completely
	if (isRail) {
		return null;
	}

	const filteredThreads = threads.filter((t) =>
		t.title.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	return (
		<>
			<SidebarGroup className="flex-1 min-h-0 flex flex-col p-2 overflow-hidden">
				<div className="flex items-center justify-between px-2 py-1 shrink-0">
					<SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Threads
					</SidebarGroupLabel>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								disabled={isCreating}
								onClick={createNewThread}
								className="h-6 w-6 p-0 hover:bg-sidebar-accent"
							>
								<Plus className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="text-xs">
							{isCreating ? "Creating..." : "New Thread"}
						</TooltipContent>
					</Tooltip>
				</div>

				<div className="px-2 py-1 mb-1 shrink-0">
					<div className="relative">
						<Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search conversations..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-sidebar-accent/40 border-sidebar-border"
						/>
					</div>
				</div>

				<SidebarGroupContent className="flex-1 min-h-0 overflow-y-auto pr-1">
					<SidebarMenu>
						{filteredThreads.length === 0 ? (
							<div className="px-3 py-2 text-[11px] text-muted-foreground italic">
								{searchQuery ? "No matching threads." : "No threads created yet."}
							</div>
						) : (
							filteredThreads.map((t) => {
								const isActive = t.thread_id === activeThreadId;
								return (
									<SidebarMenuItem key={t.thread_id}>
										<SidebarMenuButton
											isActive={isActive}
											onClick={() => onSelectThread?.(t.thread_id)}
											tooltip={t.title}
											className="group/btn"
										>
											<MessageSquare className="w-3.5 h-3.5 text-primary shrink-0" />
											<span className="truncate text-xs font-medium">{t.title}</span>
										</SidebarMenuButton>

										<DropdownMenu>
											<Tooltip>
												<TooltipTrigger asChild>
													<DropdownMenuTrigger asChild>
														<SidebarMenuAction>
															<MoreHorizontal className="w-3.5 h-3.5" />
														</SidebarMenuAction>
													</DropdownMenuTrigger>
												</TooltipTrigger>
												<TooltipContent side="right" className="text-xs">
													Thread options
												</TooltipContent>
											</Tooltip>
											<DropdownMenuContent align="end" className="w-40">
												<DropdownMenuItem
													onClick={() => openRenameDialog(t)}
													className="gap-2 text-xs cursor-pointer"
												>
													<Pencil className="w-3.5 h-3.5" />
													Rename
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => openDeleteDialog(t)}
													className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive"
												>
													<Trash2 className="w-3.5 h-3.5" />
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</SidebarMenuItem>
								);
							})
						)}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>

			{/* Shadcn Rename Thread Dialog */}
			<Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>Rename Thread</DialogTitle>
						<DialogDescription>
							Enter a new title for this conversation thread.
						</DialogDescription>
					</DialogHeader>
					<div className="py-2">
						<Input
							value={renameTitle}
							onChange={(e) => setRenameTitle(e.target.value)}
							placeholder="Thread title..."
							onKeyDown={(e) => {
								if (e.key === "Enter") confirmRename();
							}}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsRenameOpen(false)}>
							Cancel
						</Button>
						<Button onClick={confirmRename} disabled={!renameTitle.trim()}>
							Save Changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Shadcn Delete Thread Alert Dialog */}
			<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Thread?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete{" "}
							<span className="font-semibold text-foreground">
								"{deleteTarget?.title}"
							</span>
							? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setIsDeleteOpen(false)}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete Thread
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
