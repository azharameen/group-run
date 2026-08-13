import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
	connectSSE,
	streamThreadMessage,
	getThreadMessages,
	listThreads,
	approveInterrupt,
	rejectInterrupt,
	type StreamEvent,
	type ThreadMetadata,
} from "@/api/client";
import { type InterruptPayload } from "@/api/threads";
import type { ChatMessage, TaskItem } from "@/types/chat";
import { eventToMessage, groupMessages } from "@/lib/chat-utils";

// Cap transcript size to prevent unbounded memory growth
const MAX_MESSAGES = 500;

export interface UseChatStreamOptions {
	activeThreadId: string | null;
	activeIdeaId?: string | null;
	ensureThread: () => Promise<string>;
	onThreadsUpdate: (threads: ThreadMetadata[]) => void;
}

export function useChatStream({
	activeThreadId,
	activeIdeaId,
	ensureThread,
	onThreadsUpdate,
}: UseChatStreamOptions) {
	const [chatInput, setChatInput] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [messageQueue, setMessageQueue] = useState<string[]>([]);
	const [rawMessages, setRawMessages] = useState<ChatMessage[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [taskStats, setTaskStats] = useState({ completed: 0, total: 0 });

	// Interrupt state
	const [pendingInterrupt, setPendingInterrupt] = useState<InterruptPayload | null>(null);
	const isInterruptActive = pendingInterrupt !== null;
	const activeInterruptIdRef = useRef<string | null>(null);

	const abortRef = useRef<AbortController | null>(null);
	const streamMsgIdRef = useRef<string | null>(null);
	const queueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fetchCounterRef = useRef(0);

	// Clean up pending timeouts and abort controllers on unmount
	useEffect(() => {
		return () => {
			if (queueTimeoutRef.current) {
				clearTimeout(queueTimeoutRef.current);
			}
			abortRef.current?.abort();
		};
	}, []);

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

	// Fetch initial tasks (one-time bootstrap only)
	useEffect(() => {
		fetch(`/api/agent-tasks`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.tasks) {
					setTasks(data.tasks);
					setTaskStats({ completed: data.completed, total: data.total });
				}
			})
			.catch((err) => console.error("Error fetching agent tasks:", err));
	}, []);

	// SSE: background agent.progress events + tasks_update + interrupts
	useEffect(() => {
		const es = connectSSE(
			(event, data) => {
				if (event === "agent.progress" && data) {
						// Filter: only show progress events for the active idea (or global events)
						if (activeIdeaId && data.idea_id && data.idea_id !== activeIdeaId) return;
						setRawMessages((prev) => {
							const msg = eventToMessage({
								type: "transition",
								content: data.message,
								agent: data.agent_name || "workflow-orchestrator",
								speaker: data.agent_name || "Workflow Orchestrator",
								role: "orchestrator",
								provenance: `sse:${data.idea_id || "global"}`,
							});
							const next = [...prev, msg];
							return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
						});
				}
			},
			// onError: reconnect handler — reload interrupt state on reconnection
			async () => {
				// On SSE reconnect, fetch pending interrupts to reconcile state
				try {
					const res = await fetch("/api/interrupts/pending");
					if (res.ok) {
						const data = await res.json();
						const interrupts = data.interrupts || [];
						if (interrupts.length > 0) {
							// Restore the most recent pending interrupt
							const latest = interrupts[interrupts.length - 1];
							activeInterruptIdRef.current = latest.id;
							setPendingInterrupt(latest);
						} else {
							// No pending interrupts — clear stale state
							setPendingInterrupt(null);
							activeInterruptIdRef.current = null;
						}
					}
				} catch {
					// Silently fail — SSE will catch up with new events
				}
			},
			(eventType, payload) => {
				// interrupt.created — set pending interrupt with deduplication
				if (eventType === "interrupt.created") {
					const interrupt = payload.interrupt || payload;
					const id = interrupt?.id;
					if (!id) return;
					// skip if already showing this interrupt (dedup)
					if (id === activeInterruptIdRef.current) return;
					activeInterruptIdRef.current = id;
					setPendingInterrupt(interrupt);
					// Add visual indicator message in chat
						setRawMessages((prev) => {
							const msg = {
								id: `interrupt_${id}`,
								sender: "System",
								text: `Agent requires approval: ${interrupt.message || interrupt.tool_name || "action"}`,
								timestamp: new Date().toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								}),
								eventType: "interrupt",
								details: { interrupt_id: id, tool_name: interrupt.tool_name },
							};
							const next = [...prev, msg];
							return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
						});
				} else if (
					eventType === "interrupt.approved" ||
					eventType === "interrupt.rejected"
				) {
					const id = payload.interrupt?.id || payload.id;
					if (id) {
						setPendingInterrupt((prev) =>
							prev?.id === id ? null : prev,
						);
						if (id === activeInterruptIdRef.current) {
							activeInterruptIdRef.current = null;
						}
					}
				}
			},
		);
		return () => es.close();
	}, []);

	// Sync message loading when activeThreadId updates (with stale fetch guard)
	useEffect(() => {
		// Abort in-flight stream when switching threads
		if (isGenerating && abortRef.current) {
			abortRef.current.abort();
		}

		if (activeThreadId) {
			setRawMessages([]);
			const counter = ++fetchCounterRef.current;
			getThreadMessages(activeThreadId)
				.then(({ messages: msgs }) => {
					if (counter !== fetchCounterRef.current) return;
					const chatMessages = msgs.map((m) => ({
						id: m.id,
						sender: m.type === "human" ? "You" : m.name || "Assistant",
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
						eventType: m.type === "human" ? "user_message" : "message",
					}));
					setRawMessages(chatMessages);
				})
				.catch((err) => console.error("Error fetching thread messages:", err));
		} else {
			setRawMessages([]);
		}
	}, [activeThreadId, isGenerating]);

	const handleStopGeneration = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setIsGenerating(false);
		setMessageQueue([]);
	}, []);

	const toggleTrace = useCallback((id: string) => {
		setRawMessages((prev) =>
			prev.map((msg) =>
				msg.id === id ? { ...msg, isTraceOpen: !msg.isTraceOpen } : msg,
			),
		);
	}, []);

	// Interrupt approval handlers
	const handleApproveInterrupt = useCallback(
		async (id: string, decision: string, reason: string) => {
			try {
				await approveInterrupt(id, decision, reason);
				setPendingInterrupt(null);
				activeInterruptIdRef.current = null;
			} catch {
				// SSE will clear the interrupt when the resolution event arrives
				setPendingInterrupt(null);
				activeInterruptIdRef.current = null;
			}
		},
		[],
	);

	const handleRejectInterrupt = useCallback(
		async (id: string, reason: string) => {
			try {
				await rejectInterrupt(id, reason);
				setPendingInterrupt(null);
				activeInterruptIdRef.current = null;
			} catch {
				setPendingInterrupt(null);
				activeInterruptIdRef.current = null;
			}
		},
		[],
	);

	const executeSend = useCallback(
		async (textToSend: string) => {
			const userMsg: ChatMessage = {
				id: `u_${Date.now()}`,
				sender: "You",
				text: textToSend,
				timestamp: new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
			};
			setRawMessages((prev) => {
				const next = [...prev, userMsg];
				return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
			});
			setIsGenerating(true);

			let tid: string;
			try {
				tid = await ensureThread();
			} catch {
				setIsGenerating(false);
				return;
			}

			const ctrl = new AbortController();
			abortRef.current = ctrl;

			try {
				await streamThreadMessage(
					tid,
					textToSend,
					undefined,
					(evt: StreamEvent) => {
						// Task 3: Detect interrupt events from stream
						if (evt.type === "interrupt") {
							const interrupt = evt.extras?.interrupt || evt;
							const id = (interrupt as any).id || `stream_${Date.now()}`;
							// Deduplication: skip if same ID already active
							if (id === activeInterruptIdRef.current) return;
							activeInterruptIdRef.current = id;
							setPendingInterrupt(interrupt as InterruptPayload);
								setRawMessages((prev) => {
									const msg = {
										id: `interrupt_${id}`,
										sender: "System",
										text: `Agent requires approval: ${(interrupt as any).message || (interrupt as any).tool_name || "action"}`,
										timestamp: new Date().toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										}),
										eventType: "interrupt",
										details: { interrupt_id: id, tool_name: (interrupt as any).tool_name },
									};
									const next = [...prev, msg];
									return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
								});
							return;
						}

						if (evt.type === "tasks_update" && evt.tasks) {
							setTasks(evt.tasks as unknown as TaskItem[]);
							setTaskStats({
								completed: evt.completed || 0,
								total: evt.total || 0,
							});
							return;
						}

						if (evt.type === "done") {
							streamMsgIdRef.current = null;
							setIsGenerating(false);
							listThreads()
								.then(onThreadsUpdate)
								.catch(() => {});
							return;
						}

						if (evt.type === "state_update") {
								const response = evt.response ?? "";
								const text = typeof response === "string" ? response : JSON.stringify(response);
								if (!text) return;
								const msgId = streamMsgIdRef.current;
								if (msgId) {
									setRawMessages((prev) =>
										prev.map((m) =>
											m.id === msgId
												? { ...m, text: m.text + text, isStreaming: true }
												: m,
										),
									);
								} else {
									const newMsg = eventToMessage({
										...evt,
										text: text,
									});
									streamMsgIdRef.current = newMsg.id;
									setRawMessages((prev) => [...prev, newMsg]);
								}
								return;
							}

						if (evt.type === "error") {
								const errorData = (evt.error || {}) as Record<string, unknown>;
								const errorText = typeof errorData?.message === "string" ? errorData.message : evt.message || "An error occurred";
								const errorMsg: ChatMessage = {
									id: `error_${Date.now()}`,
									sender: "System",
									text: errorText,
									timestamp: new Date().toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
									}),
									eventType: "error",
									details: {
										code: typeof errorData?.code === "string" ? errorData.code : evt.code,
										retryable: typeof errorData?.retryable === "boolean" ? errorData.retryable : (evt.retryable ?? false),
									},
								};
								setRawMessages((prev) => [...prev, errorMsg]);
								streamMsgIdRef.current = null;
								setIsGenerating(false);
								return;
							}

						setRawMessages((prev) => [...prev, eventToMessage(evt)]);
					},
					ctrl.signal,
				);
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					console.error("[Chat Stream Error]", err);
				}
			} finally {
				setIsGenerating(false);
				abortRef.current = null;

				setMessageQueue((prevQueue) => {
					if (prevQueue.length > 0) {
						const [nextMsg, ...remaining] = prevQueue;
						queueTimeoutRef.current = setTimeout(() => executeSend(nextMsg), 200);
						return remaining;
					}
					return [];
				});
			}
		},
		[ensureThread, onThreadsUpdate],
	);

	const handleSendOrQueue = useCallback(() => {
		if (!chatInput.trim()) return;
		const text = chatInput.trim();
		setChatInput("");
		if (isGenerating) {
			setMessageQueue((prev) => [...prev, text]);
		} else {
			executeSend(text);
		}
	}, [chatInput, isGenerating, executeSend]);

	return {
		chatInput,
		setChatInput,
		isGenerating,
		messageQueue,
		messages,
		searchQuery,
		setSearchQuery,
		tasks,
		taskStats,
		pendingInterrupt,
		isInterruptActive,
		handleApproveInterrupt,
		handleRejectInterrupt,
		handleStopGeneration,
		toggleTrace,
		handleSendOrQueue,
		executeSend,
	};
}
