import * as React from "react";
import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableRow,
	TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
	Select,
	SelectValue,
	SelectTrigger,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@/components/ui/pagination";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	BotMessageSquare,
	Plus,
	CheckCircle2,
	Clock,
	Cpu,
	ListTodo,
	Search,
	Folder,
	FileText,
	Code,
	Copy,
	Check,
	Terminal as TerminalIcon,
	Globe,
	Settings,
	MoreHorizontal,
	FileCode,
	GripVertical,
	RefreshCw,
	ArrowLeft,
	ArrowRight,
	ArrowUpDown,
	ChevronLeft,
	ChevronRight,
	Trash2,
} from "lucide-react";
import {
	STATIC_FILES,
	DEFAULT_TASK_ITEMS,
	DEFAULT_SYSTEM_METRICS,
	DEFAULT_ACTIVITY_LOG,
	TASK_AGENTS,
} from "@/data/mockWorkspaceData";
import type {
	StaticFile,
	AgentTaskItem,
	ActivityLogItem,
	SystemMetricItem,
} from "@/types/workspace";

// Re-export types and data for consumers
export type { StaticFile, AgentTaskItem, ActivityLogItem, SystemMetricItem };
export { STATIC_FILES, DEFAULT_TASK_ITEMS };


export function CommandCenterWorkspacePane() {
	// Filesystem state
	const [fsSearch, setFsSearch] = useState("");
	const [selectedFilePath, setSelectedFilePath] = useState("docs/file_tree.md");
	const [copiedFile, setCopiedFile] = useState(false);

	const selectedFile = useMemo(
		() => STATIC_FILES.find((f) => f.path === selectedFilePath) ?? STATIC_FILES[0],
		[selectedFilePath],
	);

	const filteredFiles = useMemo(
		() =>
			STATIC_FILES.filter((f) =>
				f.path.toLowerCase().includes(fsSearch.toLowerCase()),
			),
		[fsSearch],
	);

	const handleCopyContent = (content: string) => {
		navigator.clipboard.writeText(content);
		setCopiedFile(true);
		setTimeout(() => setCopiedFile(false), 2000);
	};

	// Terminal state — initial lines sourced from TERMINAL_INIT_LINES constant
	const TERMINAL_INIT_LINES: string[] = [
		"Microsoft Windows [Version 10.0.22631.3880]",
		"(c) Microsoft Corporation. All rights reserved.",
		"",
		"Companion Engine CLI initialized successfully.",
		"Type 'help' for a list of available companion commands.",
		"",
		"C:\\workspace\\Companion> $ mkdir -p /workspace/research",
		"C:\\workspace\\Companion> $ cd /workspace/research",
		"C:\\workspace\\research> $ git clone https://github.com/companion-org/template.git .",
		"Cloning into '.'...",
		"remote: Enumerating objects: 120, done.",
		"remote: Counting objects: 100% (120/120), done.",
		"Receiving objects: 100% (120/120), done.",
		"C:\\workspace\\research> $ npm install",
		"added 452 packages, and audited 453 packages in 3s",
		"C:\\workspace\\research> $ ",
	];
	const [terminalInput, setTerminalInput] = useState("");
	const [terminalLines, setTerminalLines] = useState<string[]>(TERMINAL_INIT_LINES);
	const terminalEndRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [terminalLines]);

	const handleTerminalSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!terminalInput.trim()) return;

		const cmd = terminalInput.trim();
		const currentPath = "C:\\workspace\\research>";
		const newLines = [...terminalLines, `${currentPath} $ ${cmd}`];

		if (cmd.toLowerCase() === "help") {
			newLines.push(
				"Available commands:",
				"  help            Display this information",
				"  clear           Clear terminal screen",
				"  git status      Check repository status",
				"  npm run dev     Start local agent interface dashboard",
				"  env             Display Companion environmental settings",
			);
		} else if (cmd.toLowerCase() === "clear") {
			setTerminalLines([]);
			setTerminalInput("");
			return;
		} else if (cmd.toLowerCase() === "git status") {
			newLines.push(
				"On branch main",
				"Your branch is up to date with 'origin/main'.",
				"",
				"nothing to commit, working tree clean",
			);
		} else if (cmd.toLowerCase() === "npm run dev") {
			newLines.push(
				"Running Companion Dashboard...",
				"  Local:   http://localhost:5173/",
				"  Network: http://192.168.1.52:5173/",
				"vite v5.2.11 ready in 280ms",
			);
		} else if (cmd.toLowerCase() === "env") {
			newLines.push(
				"COMPANION_API_URL=http://localhost:8000",
				"COMPANION_ENV=development",
				"COMPANION_SSE_ENABLED=true",
			);
		} else {
			newLines.push(`Command not recognized: '${cmd}'. Type 'help' for options.`);
		}

		newLines.push("");
		setTerminalLines(newLines);
		setTerminalInput("");
	};

	// Browser state
	const [browserUrl, setBrowserUrl] = useState("https://companion-dev.local/");

	// Agent Tasks Table state
	const [workspaceTasks, setWorkspaceTasks] = useState<AgentTaskItem[]>(DEFAULT_TASK_ITEMS);
	const [taskFilter, setTaskFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("ALL");
	const [priorityFilter] = useState<string>("ALL");
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
	const [sortColumn, setSortColumn] = useState<"title" | "agent" | "priority" | "status" | null>(null);
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(5);
	const [selectedDetailTask, setSelectedDetailTask] = useState<AgentTaskItem | null>(null);
	const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
	const [taskSheetMode, setTaskSheetMode] = useState<"create" | "edit">("edit");
	const [sheetTitle, setSheetTitle] = useState("");
	const [sheetAgent, setSheetAgent] = useState(TASK_AGENTS[1].label);
	const [sheetStatus, setSheetStatus] = useState<AgentTaskItem["status"]>("To Do");
	const [sheetThought, setSheetThought] = useState("");
	const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
	const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

	const openCreateTaskSheet = () => {
		setTaskSheetMode("create");
		setSheetTitle("");
		setSheetAgent(TASK_AGENTS[1].label);
		setSheetStatus("To Do");
		setSheetThought("Manually created agent task");
		setSelectedDetailTask(null);
		setIsDetailSheetOpen(true);
	};

	const openEditTaskSheet = (task: AgentTaskItem) => {
		setTaskSheetMode("edit");
		setSelectedDetailTask(task);
		setSheetTitle(task.title);
		setSheetAgent(task.agent);
		setSheetStatus(task.status);
		setSheetThought(task.thought || "");
		setIsDetailSheetOpen(true);
	};

	const handleDropReorder = (targetTaskId: string) => {
		if (!draggedTaskId || draggedTaskId === targetTaskId) return;

		setWorkspaceTasks((prevTasks) => {
			const sourceIndex = prevTasks.findIndex((t) => t.id === draggedTaskId);
			const targetIndex = prevTasks.findIndex((t) => t.id === targetTaskId);
			if (sourceIndex < 0 || targetIndex < 0) return prevTasks;
			const updated = [...prevTasks];
			const [movedItem] = updated.splice(sourceIndex, 1);
			updated.splice(targetIndex, 0, movedItem);
			return updated;
		});

		setDraggedTaskId(null);
		setDragOverTaskId(null);
	};

	const filteredAndSortedTasks = useMemo(() => {
		let list = workspaceTasks.filter((t) => {
			const matchesSearch =
				!taskFilter.trim() ||
				t.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
				t.agent.toLowerCase().includes(taskFilter.toLowerCase()) ||
				(t.thought && t.thought.toLowerCase().includes(taskFilter.toLowerCase()));
			const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
			const matchesPriority = priorityFilter === "ALL" || t.priority === priorityFilter;
			return matchesSearch && matchesStatus && matchesPriority;
		});

		if (sortColumn) {
			list = [...list].sort((a, b) => {
				const valA = (a[sortColumn] || "").toLowerCase();
				const valB = (b[sortColumn] || "").toLowerCase();
				if (valA < valB) return sortDirection === "asc" ? -1 : 1;
				if (valA > valB) return sortDirection === "asc" ? 1 : -1;
				return 0;
			});
		}

		return list;
	}, [workspaceTasks, taskFilter, statusFilter, priorityFilter, sortColumn, sortDirection]);

	const totalPages = Math.max(1, Math.ceil(filteredAndSortedTasks.length / pageSize));
	const paginatedTasks = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredAndSortedTasks.slice(start, start + pageSize);
	}, [filteredAndSortedTasks, currentPage, pageSize]);

	const handleSort = (column: "title" | "agent" | "priority" | "status") => {
		if (sortColumn === column) {
			if (sortDirection === "asc") {
				setSortDirection("desc");
			} else {
				setSortColumn(null);
				setSortDirection("asc");
			}
		} else {
			setSortColumn(column);
			setSortDirection("asc");
		}
	};

	const handleSelectAllRows = (checked: boolean) => {
		if (checked) {
			setSelectedTaskIds(paginatedTasks.map((t) => t.id));
		} else {
			setSelectedTaskIds([]);
		}
	};

	const handleSelectRow = (id: string, checked: boolean) => {
		if (checked) {
			setSelectedTaskIds((prev) => [...prev, id]);
		} else {
			setSelectedTaskIds((prev) => prev.filter((i) => i !== id));
		}
	};

	return (
		<div className="flex flex-col h-full overflow-hidden bg-background">
			<Tabs defaultValue="filesystem" className="flex flex-col h-full w-full overflow-hidden">
				{/* Header bar / tabbed selector */}
				<div className="border-b px-4 flex items-center justify-between h-14 shrink-0 bg-muted/20">
					<TabsList className="h-9">
						<TabsTrigger value="filesystem" className="text-xs gap-1.5 px-3">
							<Folder className="w-3.5 h-3.5" />
							Filesystem
						</TabsTrigger>
						<TabsTrigger value="terminal" className="text-xs gap-1.5 px-3">
							<TerminalIcon className="w-3.5 h-3.5" />
							Terminal
						</TabsTrigger>
						<TabsTrigger value="browser" className="text-xs gap-1.5 px-3">
							<Globe className="w-3.5 h-3.5" />
							Browser
						</TabsTrigger>
						<TabsTrigger value="tasks" className="text-xs gap-1.5 px-3">
							<ListTodo className="w-3.5 h-3.5" />
							Tasks
						</TabsTrigger>
					</TabsList>

					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Settings className="w-4 h-4 cursor-pointer hover:text-foreground" />
					</div>
				</div>

				{/* Viewports content */}
				<div className="flex-1 overflow-hidden flex flex-col h-full">
					{/* Tab: Filesystem Explorer */}
					<TabsContent value="filesystem" className="data-[state=active]:flex data-[state=active]:flex-1 flex-col h-full w-full m-0 p-0 overflow-hidden">
						<div className="grid grid-cols-1 md:grid-cols-12 h-full overflow-hidden">
							{/* Left Tree Explorer */}
							<div className="md:col-span-4 border-r bg-muted/5 flex flex-col h-full overflow-hidden">
								<div className="p-3 border-b space-y-2">
									<div className="relative">
										<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											type="search"
											placeholder="Search workspace files..."
											value={fsSearch}
											onChange={(e) => setFsSearch(e.target.value)}
											className="pl-8 h-8 text-xs bg-background"
										/>
									</div>
								</div>

								<ScrollArea className="flex-1 p-2">
									<div className="space-y-4">
										<div>
											<span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
												docs
											</span>
											<div className="space-y-0.5 mt-1">
												{filteredFiles
													.filter((f) => f.path.startsWith("docs/"))
													.map((file) => {
														const isSelected = file.path === selectedFilePath;
														return (
															<button
																key={file.path}
																onClick={() => setSelectedFilePath(file.path)}
																className={`w-full flex items-center justify-between p-1.5 px-2.5 rounded-md text-left transition-colors text-xs ${
																	isSelected
																		? "bg-primary text-primary-foreground font-medium shadow-xs"
																		: "hover:bg-muted text-foreground"
																}`}
															>
																<div className="flex items-center gap-2 min-w-0">
																	{file.ext === ".md" ? (
																		<FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary-foreground" : "text-blue-500"}`} />
																	) : (
																		<Code className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary-foreground" : "text-emerald-500"}`} />
																	)}
																	<span className="truncate font-mono text-[11px]">
																		{file.filename}
																	</span>
																</div>
															</button>
														);
													})}
											</div>
										</div>

										<div>
											<span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
												root
											</span>
											<div className="space-y-0.5 mt-1">
												{filteredFiles
													.filter((f) => !f.path.startsWith("docs/"))
													.map((file) => {
														const isSelected = file.path === selectedFilePath;
														return (
															<button
																key={file.path}
																onClick={() => setSelectedFilePath(file.path)}
																className={`w-full flex items-center justify-between p-1.5 px-2.5 rounded-md text-left transition-colors text-xs ${
																	isSelected
																		? "bg-primary text-primary-foreground font-medium shadow-xs"
																		: "hover:bg-muted text-foreground"
																}`}
															>
																<div className="flex items-center gap-2 min-w-0">
																	<FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary-foreground" : "text-orange-500"}`} />
																	<span className="truncate font-mono text-[11px]">
																		{file.filename}
																	</span>
																</div>
															</button>
														);
													})}
											</div>
										</div>
									</div>
								</ScrollArea>
							</div>

							{/* Right Content Viewer */}
							<div className="md:col-span-8 flex flex-col h-full overflow-hidden bg-background p-4">
								{selectedFile ? (
									<div className="flex flex-col h-full overflow-hidden space-y-3">
										{/* File Header */}
										<div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/20 rounded-lg border shrink-0">
											<div className="flex items-center gap-2">
												<FileCode className="w-4 h-4 text-primary" />
												<span className="font-mono text-xs font-semibold text-foreground">
													{selectedFile.path}
												</span>
												<Badge variant="outline" className="text-[10px] uppercase font-mono">
													{selectedFile.ext.replace(".", "")}
												</Badge>
											</div>

											<div className="flex items-center gap-3 text-xs text-muted-foreground">
												<span className="text-[11px]">
													{(selectedFile.size_bytes / 1024).toFixed(2)} KB
												</span>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleCopyContent(selectedFile.content)}
															className="h-7 w-7 p-0"
														>
															{copiedFile ? (
																<Check className="w-3.5 h-3.5 text-emerald-600" />
															) : (
																<Copy className="w-3.5 h-3.5" />
															)}
														</Button>
													</TooltipTrigger>
													<TooltipContent side="left" className="text-xs">
														{copiedFile ? "Copied!" : "Copy contents"}
													</TooltipContent>
												</Tooltip>
											</div>
										</div>

										{/* Viewer pane */}
										<div className="flex-1 overflow-auto border rounded-lg p-4 bg-muted/10 font-mono text-xs text-foreground leading-relaxed">
											<pre className="whitespace-pre-wrap">{selectedFile.content}</pre>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-center h-full text-muted-foreground text-xs">
										Select a file from the explorer list to view content.
									</div>
								)}
							</div>
						</div>
					</TabsContent>

					{/* Tab: Terminal Console */}
					<TabsContent value="terminal" className="data-[state=active]:flex data-[state=active]:flex-1 flex-col h-full w-full m-0 p-0 overflow-hidden">
						<div className="flex items-center px-4 py-2 border-b bg-muted/5 shrink-0 justify-between">
							<div className="flex gap-2">
								<Badge className="bg-emerald-600 hover:bg-emerald-600 font-mono text-[10px] text-white">
									Session 1
								</Badge>
							</div>
							<span className="text-[10px] font-mono text-muted-foreground">
								powershell.exe (companion-terminal)
							</span>
						</div>

						<div className="flex-1 overflow-hidden flex flex-col p-4 bg-black text-slate-200 font-mono text-xs">
							<ScrollArea className="flex-1 pr-2">
								<div className="space-y-1 select-text">
									{terminalLines.map((line, index) => (
										<div key={index} className="whitespace-pre-wrap min-h-[14px]">
											{line}
										</div>
									))}
									<div ref={terminalEndRef} />
								</div>
							</ScrollArea>

							<form onSubmit={handleTerminalSubmit} className="flex items-center border-t border-slate-800 pt-2 shrink-0">
								<span className="text-emerald-500 mr-2 font-bold select-none">$</span>
								<input
									type="text"
									value={terminalInput}
									onChange={(e) => setTerminalInput(e.target.value)}
									placeholder="Type terminal command e.g., 'help'..."
									className="flex-1 bg-transparent border-0 outline-none ring-0 text-slate-100 placeholder:text-slate-600 text-xs font-mono p-0 focus:ring-0 focus:outline-none"
								/>
							</form>
						</div>
					</TabsContent>

					{/* Tab: Mock Browser */}
					<TabsContent value="browser" className="data-[state=active]:flex data-[state=active]:flex-1 flex-col h-full w-full m-0 p-0 overflow-hidden">
						<div className="flex items-center gap-2 p-2 border-b bg-muted/10 shrink-0">
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="icon" className="w-7 h-7" disabled>
									<ArrowLeft className="w-3.5 h-3.5" />
								</Button>
								<Button variant="ghost" size="icon" className="w-7 h-7" disabled>
									<ArrowRight className="w-3.5 h-3.5" />
								</Button>
								<Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => {}}>
									<RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
								</Button>
							</div>

							<div className="flex-1">
								<Input
									value={browserUrl}
									onChange={(e) => setBrowserUrl(e.target.value)}
									className="h-8 bg-background text-xs font-mono select-all focus:ring-1 focus:ring-primary"
								/>
							</div>
						</div>

						<div className="flex-1 bg-muted/30 p-6 overflow-auto">
							<Card className="max-w-3xl mx-auto overflow-hidden">
								<CardHeader className="bg-primary/5 border-b p-4">
									<div className="flex items-center justify-between">
										<div>
											<CardTitle className="text-sm font-semibold flex items-center gap-2">
												<BotMessageSquare className="w-4 h-4 text-primary" />
												Companion Agentic Platform
											</CardTitle>
											<p className="text-[10px] text-muted-foreground mt-0.5">
												Local sandbox prototype server workspace
											</p>
										</div>
										<Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 font-mono text-[10px]">
											Online
										</Badge>
									</div>
								</CardHeader>

								<CardContent className="p-5 space-y-6">
									<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
										{DEFAULT_SYSTEM_METRICS.map((metric) => (
											<div key={metric.id} className="p-3 border rounded-lg bg-background text-center">
												<span className="text-[10px] font-semibold text-muted-foreground uppercase">
													{metric.label}
												</span>
												<p className={`text-xl font-bold mt-1 ${metric.valueColor ?? ""}`}>{metric.value}</p>
											</div>
										))}
									</div>

									<div className="space-y-3">
										<span className="text-xs font-semibold text-foreground uppercase tracking-wider">
											Agent Activity Log
										</span>
										<div className="space-y-2">
											{DEFAULT_ACTIVITY_LOG.map((act) => (
												<div key={act.id} className="p-3 border rounded-lg bg-background flex items-center justify-between text-xs">
													<div className="flex items-center gap-2">
														<Badge className={`${act.badgeColor} text-white font-mono text-[10px]`}>
															{act.badgeLabel}
														</Badge>
														<span className="text-muted-foreground">
															{act.description}
														</span>
													</div>
													<span className="text-[10px] font-mono text-muted-foreground">
														{act.timestamp}
													</span>
												</div>
											))}
										</div>
									</div>
								</CardContent>

							</Card>
						</div>
					</TabsContent>

					{/* Tab: Tasks Data Table */}
					<TabsContent value="tasks" className="data-[state=active]:flex data-[state=active]:flex-1 flex-col h-full w-full m-0 p-0 overflow-hidden p-4 bg-muted/5">
						<div className="flex flex-col h-full overflow-hidden space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background border rounded-lg shrink-0">
								<div className="flex items-center gap-2">
									<ListTodo className="w-4 h-4 text-primary" />
									<span className="text-sm font-semibold text-foreground">
										Agent Task Data Table
									</span>
									<Badge variant="outline" className="text-[10px] font-mono">
									{workspaceTasks.filter((t) => t.status === "Completed").length} / {workspaceTasks.length} Completed
									</Badge>
								</div>

								<div className="flex flex-wrap items-center gap-2">
									<div className="relative w-40 sm:w-52">
										<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											type="search"
											placeholder="Filter tasks or agents..."
											value={taskFilter}
											onChange={(e) => {
												setTaskFilter(e.target.value);
												setCurrentPage(1);
											}}
											className="pl-8 h-8 text-xs bg-background"
										/>
									</div>

									<Select
										value={statusFilter}
										onValueChange={(val) => {
											setStatusFilter(val);
											setCurrentPage(1);
										}}
									>
										<SelectTrigger className="h-8 w-36 text-xs">
											<SelectValue placeholder="Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="ALL" className="text-xs">All Statuses</SelectItem>
											<SelectItem value="To Do" className="text-xs">To Do</SelectItem>
											<SelectItem value="In Progress" className="text-xs">In Progress</SelectItem>
											<SelectItem value="Needs Review" className="text-xs">Needs Review</SelectItem>
											<SelectItem value="Completed" className="text-xs">Completed</SelectItem>
										</SelectContent>
									</Select>

									<Button
										size="sm"
										onClick={openCreateTaskSheet}
										className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
									>
										<Plus className="w-3.5 h-3.5" />
										Add Task
									</Button>
								</div>
							</div>

							{selectedTaskIds.length > 0 && (
								<div className="flex items-center justify-between p-2.5 bg-primary/10 border border-primary/30 rounded-lg shrink-0 text-xs">
									<span className="font-semibold text-primary">
										{selectedTaskIds.length} task{selectedTaskIds.length > 1 ? "s" : ""} selected
									</span>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setWorkspaceTasks((prev) =>
													prev.map((t) =>
														selectedTaskIds.includes(t.id) ? { ...t, status: "Completed" } : t
													)
												);
												setSelectedTaskIds([]);
											}}
											className="h-7 text-xs border-primary/30"
										>
											<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1" />
											Mark Completed
										</Button>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => {
												setWorkspaceTasks((prev) => prev.filter((t) => !selectedTaskIds.includes(t.id)));
												setSelectedTaskIds([]);
											}}
											className="h-7 text-xs"
										>
											<Trash2 className="w-3.5 h-3.5 mr-1" />
											Delete Selected
										</Button>
									</div>
								</div>
							)}

							<div className="flex-1 overflow-auto border rounded-lg bg-background">
								<Table>
									<TableHeader className="bg-muted/40 sticky top-0 z-10 border-b">
										<TableRow>
											<TableHead className="w-8 px-2 text-center"></TableHead>
											<TableHead className="w-10 text-center">
												<Checkbox
													checked={
														paginatedTasks.length > 0 &&
														paginatedTasks.every((t) => selectedTaskIds.includes(t.id))
													}
													onCheckedChange={(checked) => handleSelectAllRows(!!checked)}
												/>
											</TableHead>
											<TableHead
												onClick={() => handleSort("title")}
												className="w-[300px] text-xs font-semibold cursor-pointer hover:text-foreground whitespace-nowrap"
											>
												<div className="flex items-center gap-1.5">
													<span>Task & Activity</span>
													<ArrowUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
												</div>
											</TableHead>
											<TableHead
												onClick={() => handleSort("agent")}
												className="w-[180px] text-xs font-semibold cursor-pointer hover:text-foreground whitespace-nowrap"
											>
												<div className="flex items-center gap-1.5">
													<span>Assigned Agent</span>
													<ArrowUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
												</div>
											</TableHead>
											<TableHead
												onClick={() => handleSort("status")}
												className="w-[150px] text-xs font-semibold cursor-pointer hover:text-foreground whitespace-nowrap"
											>
												<div className="flex items-center gap-1.5">
													<span>Status</span>
													<ArrowUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
												</div>
											</TableHead>
											<TableHead className="w-[80px] text-right text-xs font-semibold whitespace-nowrap pr-4">
												Actions
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{paginatedTasks.length === 0 ? (
											<TableRow>
												<TableCell colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
													No tasks found matching your filter criteria.
												</TableCell>
											</TableRow>
										) : (
											paginatedTasks.map((t) => {
												const isSelected = selectedTaskIds.includes(t.id);
												const isBeingDragged = draggedTaskId === t.id;
												const isDragOver = dragOverTaskId === t.id;

												return (
													<TableRow
														key={t.id}
														draggable
														onDragStart={(e) => {
															e.dataTransfer.setData("text/plain", t.id);
															setDraggedTaskId(t.id);
														}}
														onDragOver={(e) => {
															e.preventDefault();
															setDragOverTaskId(t.id);
														}}
														onDragLeave={() => {
															setDragOverTaskId(null);
														}}
														onDrop={(e) => {
															e.preventDefault();
															handleDropReorder(t.id);
														}}
														onDragEnd={() => {
															setDraggedTaskId(null);
															setDragOverTaskId(null);
														}}
														className={`group hover:bg-muted/30 cursor-pointer transition-all ${
															isSelected ? "bg-primary/5" : ""
														} ${
															isBeingDragged ? "opacity-40 border-2 border-dashed border-primary" : ""
														} ${
															isDragOver ? "bg-primary/10 border-t-2 border-primary" : ""
														}`}
														onClick={() => openEditTaskSheet(t)}
													>
														<TableCell
															className="py-3 px-2 text-center"
															onClick={(e) => e.stopPropagation()}
														>
															<div
																title="Drag to reorder tasks"
																className="inline-flex items-center justify-center cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
															>
																<GripVertical className="w-4 h-4" />
															</div>
														</TableCell>
														<TableCell
															className="py-3 text-center"
															onClick={(e) => e.stopPropagation()}
														>
															<Checkbox
																checked={isSelected}
																onCheckedChange={(checked) => handleSelectRow(t.id, !!checked)}
															/>
														</TableCell>
														<TableCell className="py-3">
															<div className="space-y-1">
																<span className={`text-xs font-semibold leading-snug block ${t.status === "Completed" ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary transition-colors"}`}>
																	{t.title}
																</span>
																{t.thought && (
																	<p className="text-[11px] text-muted-foreground italic line-clamp-1 font-mono">
																		"{t.thought}"
																	</p>
																)}
															</div>
														</TableCell>
														<TableCell className="py-3">
															<div className="flex items-center gap-2">
																<Avatar className="w-6 h-6 border shrink-0">
																	<AvatarFallback className="text-[9px] bg-primary/10 text-primary font-bold">
																		{t.agent.slice(0, 2).toUpperCase()}
																	</AvatarFallback>
																</Avatar>
																<span className="text-xs font-medium text-foreground truncate max-w-[130px]">
																	{t.agent}
																</span>
															</div>
														</TableCell>
														<TableCell className="py-3">
															<Tooltip>
																<TooltipTrigger asChild>
																	<div className="inline-flex items-center">
																		{t.status === "Completed" ? (
																			<Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10.5px] px-2 py-0.5 font-medium">
																				<CheckCircle2 className="w-3 h-3 text-emerald-500" />
																				<span>Done</span>
																			</Badge>
																		) : t.status === "In Progress" ? (
																			<Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-500 text-[10.5px] px-2 py-0.5 font-medium">
																				<RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />
																				<span>Active</span>
																			</Badge>
																		) : t.status === "Needs Review" ? (
																			<Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10.5px] px-2 py-0.5 font-medium">
																				<Clock className="w-3 h-3 text-amber-500" />
																				<span>Review</span>
																			</Badge>
																		) : (
																			<Badge variant="outline" className="gap-1 border-muted-foreground/30 bg-muted/20 text-muted-foreground text-[10.5px] px-2 py-0.5 font-medium">
																				<Clock className="w-3 h-3" />
																				<span>To Do</span>
																			</Badge>
																		)}
																	</div>
																</TooltipTrigger>
																<TooltipContent side="top" className="text-xs">
																	Status: {t.status} (Click row to edit in Task Sheet)
																</TooltipContent>
															</Tooltip>
														</TableCell>
														<TableCell
															className="py-3 text-right pr-4"
															onClick={(e) => e.stopPropagation()}
														>
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																		<MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end" className="w-36">
																	<DropdownMenuItem
																		onClick={() => openEditTaskSheet(t)}
																		className="text-xs cursor-pointer"
																	>
																		View Details
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		onClick={() =>
																			setWorkspaceTasks((prev) =>
																				prev.map((item) =>
																					item.id === t.id
																						? {
																								...item,
																								status:
																									item.status === "Completed" ? "In Progress" : "Completed",
																						  }
																						: item
																				)
																			)
																		}
																		className="text-xs cursor-pointer"
																	>
																		{t.status === "Completed" ? "Reopen Task" : "Mark Completed"}
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		onClick={() =>
																			setWorkspaceTasks((prev) => prev.filter((item) => item.id !== t.id))
																		}
																		className="text-xs cursor-pointer text-destructive focus:text-destructive"
																	>
																		Delete Task
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												);
											})
										)}
									</TableBody>
								</Table>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-1 shrink-0 pt-1">
								<div className="flex items-center gap-3">
									<span>
										Showing {paginatedTasks.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-
										{Math.min(currentPage * pageSize, filteredAndSortedTasks.length)} of{" "}
										{filteredAndSortedTasks.length} tasks
									</span>
									<div className="flex items-center gap-1.5">
										<span className="text-[11px]">Rows per page:</span>
										<Select
											value={String(pageSize)}
											onValueChange={(val) => {
												setPageSize(Number(val));
												setCurrentPage(1);
											}}
										>
											<SelectTrigger className="h-7 w-16 text-xs bg-background">
												<SelectValue placeholder={String(pageSize)} />
											</SelectTrigger>
											<SelectContent side="top">
												<SelectItem value="5" className="text-xs">5</SelectItem>
												<SelectItem value="10" className="text-xs">10</SelectItem>
												<SelectItem value="20" className="text-xs">20</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								<Pagination className="mx-0 w-auto">
									<PaginationContent>
										<PaginationItem>
											<Button
												variant="outline"
												size="sm"
												disabled={currentPage <= 1}
												onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
												className="h-7 text-xs gap-1 px-2.5"
											>
												<ChevronLeft className="w-3.5 h-3.5" />
												<span>Previous</span>
											</Button>
										</PaginationItem>
										<PaginationItem className="px-2 text-xs font-medium">
											Page {currentPage} of {totalPages}
										</PaginationItem>
										<PaginationItem>
											<Button
												variant="outline"
												size="sm"
												disabled={currentPage >= totalPages}
												onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
												className="h-7 text-xs gap-1 px-2.5"
											>
												<span>Next</span>
												<ChevronRight className="w-3.5 h-3.5" />
											</Button>
										</PaginationItem>
									</PaginationContent>
								</Pagination>
							</div>
						</div>
					</TabsContent>

					{/* Task Sheet Drawer */}
					<Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
						<SheetContent
							side="right"
							className="w-full h-full sm:max-w-md md:max-w-lg flex flex-col p-0 bg-background overflow-hidden border-l"
						>
							<div className="flex flex-col h-full overflow-hidden">
								<SheetHeader className="p-4 border-b bg-muted/10 shrink-0">
									<div className="flex items-center justify-between pr-6">
										<Badge variant="outline" className="text-[10px] font-mono uppercase">
											{taskSheetMode === "create" ? "New Task" : `ID: ${selectedDetailTask?.id}`}
										</Badge>
										{taskSheetMode === "edit" && selectedDetailTask && (
											<Badge
												variant="outline"
												className={`text-[9.5px] uppercase font-semibold ${
													selectedDetailTask.status === "Completed"
														? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
														: "border-blue-500/40 text-blue-600 bg-blue-500/10"
												}`}
											>
												{selectedDetailTask.status}
											</Badge>
										)}
									</div>
									<SheetTitle className="text-base font-bold text-foreground text-left mt-2 leading-snug">
										{taskSheetMode === "create" ? "Create Agent Task" : "Edit Agent Task"}
									</SheetTitle>
									<SheetDescription className="text-xs text-muted-foreground text-left">
										{taskSheetMode === "create"
											? "Assign a new task to an autonomous agent specialist."
											: "Review and update execution parameters and agent activity logs."}
									</SheetDescription>
								</SheetHeader>

								<ScrollArea className="flex-1 p-5 space-y-5">
									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-foreground">Task Title</label>
										<Input
											placeholder="Enter task title..."
											value={sheetTitle}
											onChange={(e) => setSheetTitle(e.target.value)}
											className="h-9 text-xs bg-background"
										/>
									</div>

									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-foreground">Assigned Agent</label>
										<Select value={sheetAgent} onValueChange={setSheetAgent}>
											<SelectTrigger className="h-9 text-xs bg-background">
												<SelectValue placeholder="Select Agent" />
											</SelectTrigger>
											<SelectContent>
												{TASK_AGENTS.map((a) => (
													<SelectItem key={a.id} value={a.label} className="text-xs">
														{a.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-foreground">Execution Status</label>
										<Select value={sheetStatus} onValueChange={(v) => setSheetStatus(v as any)}>
											<SelectTrigger className="h-9 text-xs bg-background">
												<SelectValue placeholder="Select Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="To Do" className="text-xs">To Do</SelectItem>
												<SelectItem value="In Progress" className="text-xs">In Progress</SelectItem>
												<SelectItem value="Needs Review" className="text-xs">Needs Review</SelectItem>
												<SelectItem value="Completed" className="text-xs">Completed</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-foreground">
											Agent Thought & Activity Log
										</label>
										<textarea
											rows={3}
											placeholder="Agent thought context or execution steps..."
											value={sheetThought}
											onChange={(e) => setSheetThought(e.target.value)}
											className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										/>
									</div>

									<div className="p-4 border rounded-lg bg-primary/5 space-y-1.5">
										<span className="text-xs font-semibold text-primary flex items-center gap-1.5">
											<Cpu className="w-3.5 h-3.5" />
											Agent Orchestrator Pipeline
										</span>
										<p className="text-[11px] text-muted-foreground">
											Tasks are executed autonomously by domain specialist agents in the Companion multi-agent pipeline.
										</p>
									</div>
								</ScrollArea>

								<div className="p-4 border-t bg-muted/10 shrink-0 flex items-center justify-between">
									{taskSheetMode === "create" ? (
										<>
											<Button variant="ghost" size="sm" onClick={() => setIsDetailSheetOpen(false)} className="h-8 text-xs">
												Cancel
											</Button>
											<Button
												size="sm"
												disabled={!sheetTitle.trim()}
												onClick={() => {
													if (!sheetTitle.trim()) return;
													setWorkspaceTasks((prev) => [
														...prev,
														{
															id: `k_${Date.now()}`,
															title: sheetTitle.trim(),
															agent: sheetAgent,
															status: sheetStatus,
															thought: sheetThought || "Manually created agent task",
														},
													]);
													setIsDetailSheetOpen(false);
												}}
												className="h-8 text-xs gap-1.5"
											>
												<Plus className="w-3.5 h-3.5" />
												Create Task
											</Button>
										</>
									) : (
										<>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => {
													if (selectedDetailTask) {
														setWorkspaceTasks((prev) => prev.filter((item) => item.id !== selectedDetailTask.id));
													}
													setIsDetailSheetOpen(false);
												}}
												className="h-8 text-xs gap-1.5"
											>
												<Trash2 className="w-3.5 h-3.5" />
												Delete Task
											</Button>
											<Button
												size="sm"
												disabled={!sheetTitle.trim()}
												onClick={() => {
													if (selectedDetailTask && sheetTitle.trim()) {
														setWorkspaceTasks((prev) =>
															prev.map((item) =>
																item.id === selectedDetailTask.id
																	? {
																			...item,
																			title: sheetTitle.trim(),
																			agent: sheetAgent,
																			status: sheetStatus,
																			thought: sheetThought,
																	  }
																	: item
															)
														);
													}
													setIsDetailSheetOpen(false);
												}}
												className="h-8 text-xs gap-1.5"
											>
												<CheckCircle2 className="w-3.5 h-3.5" />
												Save Changes
											</Button>
										</>
									)}
								</div>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</Tabs>
		</div>
	);
}
