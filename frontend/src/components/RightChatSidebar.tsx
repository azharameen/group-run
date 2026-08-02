import * as React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarFooter,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	useSidebar,
} from "@/components/ui/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	MessageScroller,
	Message,
	Bubble,
	Marker,
	MessageActions,
	LiveTrace,
	TurnMinimap,
	type TraceStep,
} from "@/components/ui/chat-primitives";
import {
	connectSSE,
	streamThreadMessage,
	listThreads,
	createThread,
	getThreadMessages,
	type StreamEvent,
	type ThreadMetadata,
} from "@/api/client";
import {
	BotMessageSquare,
	Send,
	Plus,
	Mic,
	Square,
	ChevronDown,
	ChevronRight,
	CheckCircle2,
	Clock,
	Cpu,
	ListTodo,
	Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
	id: string;
	sender: string;
	role?: string;
	speaker?: string;
	text: string;
	timestamp: string;
	isStreaming?: boolean;
	isTraceOpen?: boolean;
	liveTrace?: TraceStep[];
	eventType?: string;
	provenance?: string;
	details?: Record<string, any>;
	params?: Record<string, any>;
	output?: any;
	from_agent?: string;
	to_agent?: string;
	tool?: string;
	decision?: string;
	reason?: string;
	status?: string;
}

interface TaskItem {
	id: string;
	title: string;
	agent: string;
	status: "In Progress" | "To Do" | "Completed";
	thought?: string;
}

function groupMessages(msgs: ChatMessage[]): ChatMessage[] {
	const grouped: ChatMessage[] = [];
	for (const msg of msgs) {
		const last = grouped[grouped.length - 1];
		if (
			msg.eventType === "message" &&
			last &&
			last.eventType === "message" &&
			last.sender === msg.sender
		) {
			last.text += "\n" + msg.text;
			if (msg.liveTrace) {
				last.liveTrace = [...(last.liveTrace || []), ...msg.liveTrace];
			}
		} else {
			grouped.push({ ...msg });
		}
	}
	return grouped;
}

const EVENT_LABELS: Record<string, string> = {
	thinking: "Thinking",
	tool_call: "Tool Call",
	tool_result: "Tool Result",
	subagent: "Subagent",
	handover: "Handover",
	interrupt: "Interrupt",
	approval: "Approval",
	retry: "Retry",
	failed: "Failed",
	completion: "Completion",
	user_message: "User",
	transition: "Orchestrator",
	message: "Message",
};

const eventToMessage = (evt: StreamEvent): ChatMessage => {
	const timestamp = new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
	const extractVisibleText = (value: unknown): string => {
		if (typeof value !== "string") return "";
		const trimmed = value.trim();
		if (!trimmed) return "";
		if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed
					.map((item) =>
						typeof item?.text === "string"
							? item.text
							: typeof item?.content === "string"
								? item.content
								: "",
					)
					.filter(Boolean)
					.join("");
			}
			if (parsed && typeof parsed === "object") {
				return typeof parsed.text === "string"
					? parsed.text
					: typeof parsed.content === "string"
						? parsed.content
						: typeof parsed.output === "string"
							? parsed.output
							: value;
			}
		} catch {
			return value;
		}
		return value;
	};
	const unwrapText = (value?: string) => {
		if (!value) return "";
		const trimmed = value.trim();
		if (!trimmed.startsWith("[")) return value;
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				const candidate = parsed
					.map((item) => item?.text || item?.content || "")
					.filter(Boolean)
					.join("");
				return candidate || value;
			}
		} catch {
			return value;
		}
		return value;
	};
	const text =
		extractVisibleText(evt.text) ||
		unwrapText(evt.text) ||
		evt.content ||
		evt.reason ||
		(typeof evt.output === "string"
			? evt.output
			: evt.output
				? JSON.stringify(evt.output, null, 2)
				: "");
	const isReasoning = evt.type === "reasoning";
	return {
		id:
			evt.id ||
			`${evt.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		sender: evt.speaker || evt.agent || EVENT_LABELS[evt.type] || "Runtime",
		speaker: evt.speaker || evt.agent,
		role: evt.role,
		text,
		timestamp,
		isStreaming:
			evt.type !== "done" && evt.type !== "completion" && evt.type !== "text",
		eventType: isReasoning ? "thinking" : evt.type,
		provenance: evt.provenance,
		liveTrace: [
			{
				type: (evt.type === "done"
					? "approval"
					: isReasoning
						? "thinking"
						: evt.type) as TraceStep["type"],
				agent: evt.agent || evt.speaker,
				content: evt.content || evt.text,
				tool: evt.tool,
				params: evt.params,
				output: evt.output,
				action: evt.action,
				from_agent: evt.from_agent,
				to_agent: evt.to_agent,
				interrupt_id: evt.interrupt_id,
				decision: evt.decision,
				reason: evt.reason,
				role: evt.role,
				speaker: evt.speaker,
				provenance: evt.provenance,
			} as TraceStep,
		],
		details: {
			action: evt.action,
			from_agent: evt.from_agent,
			to_agent: evt.to_agent,
			index: evt.index,
			extras: evt.extras,
		},
		params: evt.params,
		output: evt.output,
		from_agent: evt.from_agent,
		to_agent: evt.to_agent,
		tool: evt.tool,
		decision: evt.decision,
		reason: evt.reason,
		status: evt.status,
	};
};

const messageBadgeVariant = (type?: string) => {
	switch (type) {
		case "thinking":
			return "secondary";
		case "tool_call":
			return "outline";
		case "tool_result":
			return "secondary";
		case "subagent":
			return "outline";
		case "handover":
			return "outline";
		case "interrupt":
			return "destructive";
		case "approval":
			return "secondary";
		case "retry":
			return "outline";
		case "failed":
			return "destructive";
		case "message":
			return "default";
		case "completion":
			return "default";
		default:
			return "outline";
	}
};

// ── Component ─────────────────────────────────────────────────────────────────

export function RightChatSidebar({
	onClose,
	...props
}: React.ComponentProps<typeof Sidebar> & { onClose?: () => void }) {
	const location = useLocation();
	const [input, setInput] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [messageQueue, setMessageQueue] = useState<string[]>([]);
	const [showTasks, setShowTasks] = useState(false);
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [taskStats, setTaskStats] = useState({ completed: 0, total: 0 });
	const [searchQuery, setSearchQuery] = useState("");
	const abortRef = useRef<AbortController | null>(null);
	const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
	const [isSidebarHovered, setIsSidebarHovered] = useState(false);
	// Tracks the id of the assistant message currently accumulating token deltas.
	const streamMsgIdRef = useRef<string | null>(null);

	const match = location.pathname.match(/\/ideas\/([^/]+)/);
	const currentIdeaId = match ? match[1] : null;

	// ── Thread state ────────────────────────────────────────────────────────
	const [threads, setThreads] = useState<ThreadMetadata[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [showThreadList, setShowThreadList] = useState(false);

	// Sorted threads (most recent first)
	const sortedThreads = useMemo(
		() =>
			[...threads].sort(
				(a, b) =>
					new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
			),
		[threads],
	);

	// Load threads on mount
	useEffect(() => {
		listThreads()
			.then(setThreads)
			.catch(() => {});
	}, []);

	const activeThread = useMemo(
		() => threads.find((t) => t.thread_id === activeThreadId) ?? null,
		[threads, activeThreadId],
	);

	const [rawMessages, setRawMessages] = useState<ChatMessage[]>([]);
	const groupedMessages = useMemo(
		() => groupMessages(rawMessages),
		[rawMessages],
	);
	const messages = useMemo(
		() =>
			searchQuery.trim()
				? groupedMessages.filter(
						(m) =>
							m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
							m.sender?.toLowerCase().includes(searchQuery.toLowerCase()),
					)
				: groupedMessages,
		[groupedMessages, searchQuery],
	);

	// ── Fetch initial tasks (one-time bootstrap only) ─────────────────────────
	useEffect(() => {
		fetch(`/api/agent-tasks${currentIdeaId ? `?idea_id=${currentIdeaId}` : ""}`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.tasks) {
					setTasks(data.tasks);
					setTaskStats({ completed: data.completed, total: data.total });
				}
			})
			.catch((err) => console.error(err));
	}, [currentIdeaId]);

	// ── SSE: background agent.progress events + tasks_update ─────────────────
	useEffect(() => {
		const es = connectSSE((event, data) => {
			if (event === "agent.progress" && data) {
				setRawMessages((prev) => [
					...prev,
					eventToMessage({
						type: "transition",
						content: data.message,
						agent: data.agent_name || "workflow-orchestrator",
						speaker: data.agent_name || "Workflow Orchestrator",
						role: "orchestrator",
						provenance: `sse:${data.idea_id || "global"}`,
					}),
				]);
			}
		});
		return () => es.close();
	}, []);

	// ── Stop streaming ────────────────────────────────────────────────────────
	const handleStopGeneration = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setIsGenerating(false);
	};

	const toggleTrace = (id: string) => {
		setRawMessages((prev) =>
			prev.map((msg) =>
				msg.id === id ? { ...msg, isTraceOpen: !msg.isTraceOpen } : msg,
			),
		);
	};

	// ── Scroll to turn by index ───────────────────────────────────────────────
	const scrollToTurnIndex = (idx: number) => {
		const el = messageRefs.current[idx];
		if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
	};

	// ── Ensure a thread exists, creating one if needed ──────────────────────
	const ensureThread = useCallback(async (): Promise<string> => {
		if (activeThreadId) return activeThreadId;
		const thread = await createThread({
			title: "New Chat",
			idea_id: currentIdeaId ?? null,
		});
		setThreads((prev) => [...prev, thread]);
		setActiveThreadId(thread.thread_id);
		return thread.thread_id;
	}, [activeThreadId, currentIdeaId]);

	// ── Real streaming send (thread-based) ────────────────────────────────────
	const executeSend = useCallback(
		async (textToSend: string) => {
			// 1) Append user message
			const userMsg: ChatMessage = {
				id: `u_${Date.now()}`,
				sender: "You",
				text: textToSend,
				timestamp: new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
			};
			setRawMessages((prev) => [...prev, userMsg]);
			setIsGenerating(true);

			// 2) Ensure we have a thread
			let tid: string;
			try {
				tid = await ensureThread();
			} catch {
				setIsGenerating(false);
				return;
			}

			// 3) Open AbortController for stop support
			const ctrl = new AbortController();
			abortRef.current = ctrl;

			try {
				await streamThreadMessage(
					tid,
					textToSend,
					currentIdeaId ?? undefined,
					(evt: StreamEvent) => {
						if (evt.type === "tasks_update" && evt.tasks) {
							setTasks(evt.tasks as TaskItem[]);
							setTaskStats({
								completed: evt.completed || 0,
								total: evt.total || 0,
							});
							return;
						}

						if (evt.type === "done") {
							streamMsgIdRef.current = null;
							setIsGenerating(false);
							// Refresh thread list to get updated timestamps
							listThreads()
								.then(setThreads)
								.catch(() => {});
							return;
						}

						// Token/reasoning deltas accumulate into the last assistant
						// message instead of creating a new bubble per delta.
						if (evt.type === "token" || evt.type === "reasoning") {
							const delta = evt.content || evt.text || "";
							if (!delta) return;
							const msgId = streamMsgIdRef.current;
							if (msgId) {
								setRawMessages((prev) =>
									prev.map((m) =>
										m.id === msgId
											? { ...m, text: m.text + delta, isStreaming: true }
											: m,
									),
								);
							} else {
								const newMsg = eventToMessage({
									...evt,
									type: evt.type === "reasoning" ? "reasoning" : "message",
								});
								streamMsgIdRef.current = newMsg.id;
								setRawMessages((prev) => [...prev, newMsg]);
							}
							return;
						}

						setRawMessages((prev) => [...prev, eventToMessage(evt)]);
					},
					ctrl.signal,
				);
			} catch (err: any) {
				if (err?.name !== "AbortError") {
					console.error("[Chat Stream Error]", err);
				}
			} finally {
				setIsGenerating(false);
				abortRef.current = null;

				// Process queue
				setMessageQueue((prevQueue) => {
					if (prevQueue.length > 0) {
						const [nextMsg, ...remaining] = prevQueue;
						setTimeout(() => executeSend(nextMsg), 200);
						return remaining;
					}
					return [];
				});
			}
		},
		[currentIdeaId, ensureThread],
	);

	const handleSendOrQueue = () => {
		if (!input.trim()) return;
		const textToSend = input.trim();
		setInput("");

		if (isGenerating) {
			setMessageQueue((prev) => [...prev, textToSend]);
		} else {
			executeSend(textToSend);
		}
	};

	// ── Render ────────────────────────────────────────────────────────────────
	const { isMobile } = useSidebar();

	const sidebarContent = (
		<div className="flex flex-col h-full w-full bg-sidebar text-sidebar-foreground">
			{/* Header — matches left AppSidebar exactly */}
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							tooltip="Agent Team Chat"
							onClick={() => setShowThreadList(!showThreadList)}
						>
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
								<BotMessageSquare className="size-5" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-semibold">
									{activeThread ? activeThread.title : "Agent Team Chat"}
								</span>
								<span className="truncate text-xs text-muted-foreground">
									{activeThread
										? `${sortedThreads.length} thread${sortedThreads.length !== 1 ? "s" : ""}`
										: currentIdeaId
											? `Idea: ${currentIdeaId}`
											: "Global Workspace"}
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				{/* Thread list dropdown */}
				{showThreadList && (
					<div className="border-t bg-sidebar-accent/50 max-h-48 overflow-y-auto">
						{sortedThreads.length === 0 ? (
							<div className="px-3 py-4 text-xs text-center text-muted-foreground">
								No threads yet. Send a message to start one.
							</div>
						) : (
							sortedThreads.map((t) => (
								<button
									key={t.thread_id}
									onClick={async () => {
										setActiveThreadId(t.thread_id);
										setRawMessages([]);
										setShowThreadList(false);
										setSearchQuery("");
										// Load thread messages from checkpoint
										try {
											const { messages: msgs } = await getThreadMessages(
												t.thread_id,
											);
											const chatMessages = msgs
												.filter((m) => m.type === "human" || m.type === "ai")
												.map((m) => ({
													id: m.id,
													sender:
														m.type === "human" ? "You" : m.name || "Assistant",
													text: m.content,
													timestamp: m.timestamp
														? new Date(m.timestamp).toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															})
														: new Date().toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															}),
													eventType:
														m.type === "human" ? "user_message" : "message",
												}));
											setRawMessages(chatMessages);
										} catch {}
									}}
									className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 hover:bg-sidebar-accent transition-colors ${
										t.thread_id === activeThreadId
											? "bg-sidebar-accent font-semibold"
											: ""
									}`}
								>
									<div className="truncate">{t.title}</div>
									<div className="text-[10px] text-muted-foreground mt-0.5">
										{new Date(t.updated_at).toLocaleString()}
										{t.idea_id ? ` · ${t.idea_id}` : ""}
									</div>
								</button>
							))
						)}
					</div>
				)}
			</SidebarHeader>

			{/* Agent Plan & Tasks — SSE-driven (tasks updated from stream events) */}
			<div className="px-3 py-1.5 border-b bg-muted/20">
				<button
					onClick={() => setShowTasks(!showTasks)}
					className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground py-1"
				>
					<div className="flex items-center gap-1.5">
						<ListTodo className="w-3.5 h-3.5 text-primary" />
						<span>Agent Plan &amp; Tasks</span>
					</div>
					<div className="flex items-center gap-1">
						<Badge
							variant="outline"
							className="text-[10px] px-1 py-0 font-normal"
						>
							{taskStats.completed}/{taskStats.total || tasks.length} Done
						</Badge>
						{showTasks ? (
							<ChevronDown className="w-3.5 h-3.5" />
						) : (
							<ChevronRight className="w-3.5 h-3.5" />
						)}
					</div>
				</button>

				{showTasks && (
					<div className="mt-2 space-y-1.5 pb-1 max-h-48 overflow-y-auto">
						{tasks.map((task) => (
							<div
								key={task.id}
								className="p-2 rounded border bg-background text-[11px] space-y-1"
							>
								<div className="flex items-center justify-between font-medium">
									<span className="text-foreground truncate">{task.title}</span>
									{task.status === "Completed" ? (
										<CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
									) : task.status === "In Progress" ? (
										<Cpu className="w-3 h-3 text-primary animate-pulse shrink-0" />
									) : (
										<Clock className="w-3 h-3 text-muted-foreground shrink-0" />
									)}
								</div>
								<div className="text-[10px] text-muted-foreground">
									{task.agent}
								</div>
								{task.thought && (
									<div className="text-[9.5px] text-muted-foreground/80 italic border-l pl-1.5 font-mono">
										{task.thought}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Search bar */}
			<div className="px-3 py-1.5 border-b">
				<div className="relative">
					<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
					<input
						type="text"
						placeholder="Search transcript..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full h-8 pl-7 pr-2 rounded border bg-background text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
					/>
					{searchQuery && (
						<button
							onClick={() => setSearchQuery("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
						>
							&times;
						</button>
					)}
				</div>
				{searchQuery && (
					<div className="text-[10px] text-muted-foreground mt-1">
						{messages.length} result{messages.length !== 1 ? "s" : ""}
					</div>
				)}
			</div>

			{/* SidebarContent is flex-col — we place ONE flex-row child inside so
          TurnMinimap and messages sit side-by-side without fighting flex direction */}
			<SidebarContent className="overflow-hidden p-0">
				{/* Fixed floating minimap strip — only visible when sidebar is hovered */}
				<TurnMinimap
					totalTurns={messages.length}
					onTurnClick={scrollToTurnIndex}
					visible={isSidebarHovered}
					messages={messages}
				/>

				<div className="flex-1 p-3 overflow-hidden flex flex-col h-full">
					<MessageScroller>
						{messages.map((msg, idx) => {
							const isUser =
								msg.eventType === "user_message" ||
								msg.sender === "You" ||
								msg.sender === "Inventor" ||
								msg.sender === "user";
							const label = EVENT_LABELS[msg.eventType || ""] || "Message";
							const hasTrace = Boolean(msg.liveTrace?.length);

							return (
								<div
									key={msg.id}
									ref={(el) => {
										messageRefs.current[idx] = el;
									}}
								>
									<Message
										variant={isUser ? "user" : "agent"}
										avatarText={
											isUser
												? "YOU"
												: msg.eventType === "message"
													? msg.sender?.substring(0, 2).toUpperCase() || "AI"
													: "AI"
										}
									>
										<Marker sender={msg.sender} timestamp={msg.timestamp} />
										{msg.eventType === "message" ? (
											<div className="flex items-center gap-1.5 mb-0.5">
												<span className="text-xs font-semibold text-primary truncate">
													{msg.sender || "Agent"}
												</span>
												<span className="text-[10px] font-mono text-muted-foreground/60">
													{msg.timestamp}
												</span>
											</div>
										) : (
											<div className="flex items-center gap-2">
												<Badge
													variant={messageBadgeVariant(msg.eventType) as any}
													className="text-[10px] uppercase font-mono"
												>
													{label}
												</Badge>
												{msg.provenance && (
													<span className="text-[10px] font-mono text-muted-foreground truncate">
														{msg.provenance}
													</span>
												)}
											</div>
										)}

										{hasTrace && msg.isTraceOpen && (
											<LiveTrace
												steps={msg.liveTrace || []}
												isStreaming={msg.isStreaming}
											/>
										)}

										<Bubble
											variant={isUser ? "user" : "agent"}
											isStreaming={msg.isStreaming}
										>
											{msg.text || (msg.isStreaming ? "" : "...")}
										</Bubble>

										{msg.eventType === "tool_call" && msg.params && (
											<Collapsible>
												<CollapsibleTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														className="h-7 px-2 text-[11px]"
													>
														Tool arguments
													</Button>
												</CollapsibleTrigger>
												<CollapsibleContent className="rounded-md border bg-muted/20 p-2 text-[11px] font-mono">
													<pre className="whitespace-pre-wrap overflow-x-auto text-foreground">
														{JSON.stringify(msg.params, null, 2)}
													</pre>
												</CollapsibleContent>
											</Collapsible>
										)}

										{(msg.output ||
											msg.from_agent ||
											msg.to_agent ||
											msg.decision ||
											msg.reason) && (
											<div className="text-[11px] text-muted-foreground space-y-1">
												{msg.from_agent && msg.to_agent && (
													<div>
														{msg.from_agent} → {msg.to_agent}
													</div>
												)}
												{msg.decision && <div>Decision: {msg.decision}</div>}
												{msg.reason && <div>{msg.reason}</div>}
												{msg.output !== undefined && (
													<Collapsible>
														<CollapsibleTrigger asChild>
															<Button
																variant="ghost"
																size="sm"
																className="h-7 px-2 text-[11px]"
															>
																Result
															</Button>
														</CollapsibleTrigger>
														<CollapsibleContent className="rounded border bg-muted/20 p-2">
															<pre className="font-mono text-foreground whitespace-pre-wrap overflow-x-auto text-[11px]">
																{typeof msg.output === "string"
																	? msg.output
																	: JSON.stringify(msg.output, null, 2)}
															</pre>
														</CollapsibleContent>
													</Collapsible>
												)}
											</div>
										)}

										<MessageActions
											text={msg.text}
											variant={isUser ? "user" : "agent"}
											hasTrace={hasTrace}
											onRegenerate={
												!isUser ? () => executeSend(msg.text) : undefined
											}
											onToggleTrace={
												hasTrace ? () => toggleTrace(msg.id) : undefined
											}
										/>
									</Message>
								</div>
							);
						})}
					</MessageScroller>
				</div>
			</SidebarContent>

			{/* Footer Input */}
			<SidebarFooter className="border-t p-3 bg-sidebar">
				<div className="space-y-2">
					{messageQueue.length > 0 && (
						<div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
							<span>
								{messageQueue.length} message
								{messageQueue.length > 1 ? "s" : ""} queued
							</span>
							<Badge variant="secondary" className="text-[9px] px-1 py-0">
								Sequencing
							</Badge>
						</div>
					)}

					<div className="rounded-lg border bg-background p-2 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
						<textarea
							placeholder={
								isGenerating
									? "Type to queue message..."
									: "Ask the team to bring your idea to life"
							}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSendOrQueue();
								}
							}}
							className="w-full bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs min-h-[40px] resize-none p-0 placeholder:text-muted-foreground"
						/>
						<div className="flex items-center justify-between pt-1">
							<div className="flex items-center gap-1 text-muted-foreground">
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									title="New thread"
									onClick={async () => {
										try {
											const thread = await createThread({ title: "New Chat" });
											setThreads((prev) => [...prev, thread]);
											setActiveThreadId(thread.thread_id);
											setRawMessages([]);
											// Refresh thread list
											listThreads()
												.then(setThreads)
												.catch(() => {});
										} catch {}
									}}
								>
									<Plus className="w-3.5 h-3.5" />
								</Button>
							</div>

							{/* Dynamic: Stop / Send / Mic */}
							{isGenerating ? (
								<Button
									size="icon"
									variant="destructive"
									onClick={handleStopGeneration}
									title="Stop generation"
									className="h-7 w-7 rounded-md"
								>
									<Square className="w-3 h-3 fill-current" />
								</Button>
							) : input.trim() ? (
								<Button
									size="icon"
									onClick={handleSendOrQueue}
									title="Send message"
									className="h-7 w-7 rounded-md"
								>
									<Send className="w-3 h-3" />
								</Button>
							) : (
								<Button
									size="icon"
									variant="ghost"
									title="Voice input"
									className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
								>
									<Mic className="w-3.5 h-3.5" />
								</Button>
							)}
						</div>
					</div>
				</div>
			</SidebarFooter>
		</div>
	);

	if (isMobile) {
		return (
			<Sheet
				open={true}
				onOpenChange={(open) => {
					if (!open) {
						handleStopGeneration();
						onClose?.();
					}
				}}
				{...props}
			>
				<SheetContent
					side="right"
					className="w-[18rem] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden z-50"
				>
					{sidebarContent}
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Sidebar
			side="right"
			collapsible="none"
			className="sticky top-0 hidden h-svh border-l lg:flex w-80"
			onMouseEnter={() => setIsSidebarHovered(true)}
			onMouseLeave={() => setIsSidebarHovered(false)}
			{...props}
		>
			{sidebarContent}
		</Sidebar>
	);
}
