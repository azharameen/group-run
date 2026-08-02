import type { TraceStep } from "@/components/ui/chat-primitives";

export interface ChatMessage {
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

export interface TaskItem {
	id: string;
	title: string;
	agent: string;
	status: "In Progress" | "To Do" | "Completed";
	thought?: string;
}
