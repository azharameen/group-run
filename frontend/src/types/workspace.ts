// ─── Workspace File System ───────────────────────────────────────────────────

export interface StaticFile {
	path: string;
	filename: string;
	ext: string;
	size_bytes: number;
	modified_at: string;
	content: string;
}

// ─── Agent Tasks ──────────────────────────────────────────────────────────────

export type TaskStatus = "To Do" | "In Progress" | "Needs Review" | "Completed";
export type TaskPriority = "High" | "Medium" | "Low";

export interface AgentTaskItem {
	id: string;
	title: string;
	agent: string;
	status: TaskStatus;
	thought?: string;
	priority?: TaskPriority;
}

// ─── System / Browser Dashboard ───────────────────────────────────────────────

export interface SystemMetricItem {
	id: string;
	label: string;
	value: string;
	/** Optional Tailwind text color class for the value e.g. "text-primary" */
	valueColor?: string;
}

export interface ActivityLogItem {
	id: string;
	badgeLabel: string;
	/** Tailwind background color class e.g. "bg-blue-600" */
	badgeColor: string;
	description: string;
	timestamp: string;
}

// ─── Task Agents (available agents for assignment) ────────────────────────────

export interface TaskAgent {
	id: string;
	label: string;
}
