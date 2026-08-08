import * as React from "react";
import { cn } from "@/lib/utils";
import {
	Brain,
	Cpu,
	CheckCircle2,
	GitBranch,
	ArrowRight,
	ShieldCheck,
	RotateCw,
	AlertTriangle,
	Zap,
	ChevronDown,
	ChevronRight,
} from "lucide-react";

export interface TraceStep {
	type:
		| "thinking"
		| "tool_call"
		| "tool_result"
		| "subagent"
		| "handover"
		| "interrupt"
		| "approval"
		| "retry"
		| "failed";
	agent?: string;
	content?: string;
	tool?: string;
	params?: Record<string, any>;
	output?: string;
	action?: string;
	from_agent?: string;
	to_agent?: string;
	interrupt_id?: string;
	decision?: "approve" | "edit" | "reject" | "retry";
	reason?: string;
	role?: string;
	speaker?: string;
	provenance?: string;
	timestamp?: string;
}

interface LiveTraceProps {
	steps: TraceStep[];
	isStreaming?: boolean;
}

const traceIcon = (type: TraceStep["type"]) => {
	switch (type) {
		case "thinking":
			return <Brain className="w-3 h-3 text-violet-500 shrink-0" />;
		case "tool_call":
			return <Cpu className="w-3 h-3 text-amber-500 shrink-0" />;
		case "tool_result":
			return <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />;
		case "subagent":
			return <GitBranch className="w-3 h-3 text-blue-500 shrink-0" />;
		case "handover":
			return <ArrowRight className="w-3 h-3 text-pink-500 shrink-0" />;
		case "interrupt":
			return <ShieldCheck className="w-3 h-3 text-amber-500 shrink-0" />;
		case "approval":
			return <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />;
		case "retry":
			return <RotateCw className="w-3 h-3 text-sky-500 shrink-0" />;
		case "failed":
			return <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />;
		default:
			return <Zap className="w-3 h-3 text-muted-foreground shrink-0" />;
	}
};

const traceBadgeColor = (type: TraceStep["type"]) => {
	switch (type) {
		case "thinking":
			return "bg-violet-500/10 text-violet-600 border-violet-500/20";
		case "tool_call":
			return "bg-amber-500/10 text-amber-600 border-amber-500/20";
		case "tool_result":
			return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
		case "subagent":
			return "bg-blue-500/10 text-blue-600 border-blue-500/20";
		case "handover":
			return "bg-pink-500/10 text-pink-600 border-pink-500/20";
		case "interrupt":
			return "bg-amber-500/10 text-amber-700 border-amber-500/20";
		case "approval":
			return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
		case "retry":
			return "bg-sky-500/10 text-sky-700 border-sky-500/20";
		case "failed":
			return "bg-destructive/10 text-destructive border-destructive/20";
		default:
			return "bg-muted text-muted-foreground";
	}
};

const traceLabel = (step: TraceStep): string => {
	switch (step.type) {
		case "thinking":
			return step.content || "Thinking...";
		case "tool_call":
			return `→ ${step.tool}(${step.params ? JSON.stringify(step.params).slice(0, 40) : ""})`;
		case "tool_result":
			return step.output || "Done";
		case "subagent":
			return `Spawned ${step.agent}: ${step.action || ""}`;
		case "handover":
			return `${step.from_agent} → ${step.to_agent}`;
		case "interrupt":
			return step.content || "Interrupt pending";
		case "approval":
			return step.reason ? `Approved: ${step.reason}` : "Approved";
		case "retry":
			return step.reason ? `Retry: ${step.reason}` : "Retry requested";
		case "failed":
			return step.reason ? `Failed: ${step.reason}` : "Failed";
		default:
			return "";
	}
};

export const LiveTrace: React.FC<LiveTraceProps> = ({ steps, isStreaming }) => {
	const [isOpen, setIsOpen] = React.useState(true);

	if (!steps || steps.length === 0) return null;

	return (
		<div className="mb-2 border rounded-lg bg-muted/20 overflow-hidden text-[11px]">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/30 text-muted-foreground hover:text-foreground font-semibold text-[10px]"
			>
				<div className="flex items-center gap-1.5">
					<Zap
						className={cn(
							"w-3 h-3",
							isStreaming ? "text-primary animate-pulse" : "text-primary",
						)}
					/>
					<span>
						{isStreaming
							? "Agent Thinking..."
							: `Execution Trace (${steps.length} steps)`}
					</span>
				</div>
				{isOpen ? (
					<ChevronDown className="w-3 h-3" />
				) : (
					<ChevronRight className="w-3 h-3" />
				)}
			</button>

			{isOpen && (
				<div className="p-2 space-y-1.5 border-t max-h-56 overflow-y-auto">
					{steps.map((step, idx) => (
						<div key={idx} className="flex items-start gap-1.5 group/step">
							<div className="mt-0.5 shrink-0">{traceIcon(step.type)}</div>
							<div className="flex-1 min-w-0">
								<div
									className={cn(
										"inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono max-w-full",
										traceBadgeColor(step.type),
									)}
								>
									{step.agent && (
										<span className="font-sans font-semibold opacity-70 shrink-0">
											[{step.agent.split("—")[0]?.trim() || step.agent}]
										</span>
									)}
									<span className="truncate">{traceLabel(step)}</span>
								</div>
							</div>
						</div>
					))}
					{isStreaming && (
						<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse">
							<div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
							<span>Processing...</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
LiveTrace.displayName = "LiveTrace";
