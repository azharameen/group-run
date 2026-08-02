import type { TraceStep } from "@/components/ui/chat-primitives";
import type { StreamEvent } from "@/api/client";
import type { ChatMessage } from "@/types/chat";

export const EVENT_LABELS: Record<string, string> = {
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

export const messageBadgeVariant = (type?: string): "secondary" | "outline" | "destructive" | "default" => {
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

export const eventToMessage = (evt: StreamEvent): ChatMessage => {
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

export function groupMessages(msgs: ChatMessage[]): ChatMessage[] {
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
