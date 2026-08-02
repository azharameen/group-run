import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
	connectSSE,
	streamThreadMessage,
	getThreadMessages,
	listThreads,
	type StreamEvent,
	type ThreadMetadata,
} from "@/api/client";
import type { ChatMessage, TaskItem } from "@/types/chat";
import { eventToMessage, groupMessages } from "@/lib/chat-utils";

interface UseChatStreamOptions {
	activeThreadId: string | null;
	ensureThread: () => Promise<string>;
	onThreadsUpdate: (threads: ThreadMetadata[]) => void;
}

export function useChatStream({
	activeThreadId,
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

	const abortRef = useRef<AbortController | null>(null);
	const streamMsgIdRef = useRef<string | null>(null);
	const queueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	// SSE: background agent.progress events + tasks_update
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

	// Sync message loading when activeThreadId updates
	useEffect(() => {
		if (activeThreadId) {
			setRawMessages([]);
			getThreadMessages(activeThreadId)
				.then(({ messages: msgs }) => {
					const chatMessages = msgs
						.filter((m) => m.type === "human" || m.type === "ai")
						.map((m) => ({
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
	}, [activeThreadId]);

	const handleStopGeneration = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setIsGenerating(false);
	}, []);

	const toggleTrace = useCallback((id: string) => {
		setRawMessages((prev) =>
			prev.map((msg) =>
				msg.id === id ? { ...msg, isTraceOpen: !msg.isTraceOpen } : msg,
			),
		);
	}, []);

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
			setRawMessages((prev) => [...prev, userMsg]);
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
							listThreads()
								.then(onThreadsUpdate)
								.catch(() => {});
							return;
						}

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
		handleStopGeneration,
		toggleTrace,
		handleSendOrQueue,
		executeSend,
	};
}
