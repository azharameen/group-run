import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
	connectSSE,
	fetchWorkflowStatus,
	type WorkflowStatus,
} from "../api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, ArrowRight, Loader2, Activity } from "lucide-react";

const AGENT_ICONS: Record<string, string> = {
	discovery: "🔍",
	research: "📚",
	analysis: "📊",
	drafting: "✍️",
	review: "🔬",
};

export default function IdeasInProgress() {
	const [status, setStatus] = useState<WorkflowStatus | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const load = async () => {
			try {
				setStatus(await fetchWorkflowStatus());
			} catch {
				// silent
			} finally {
				setLoading(false);
			}
		};
		load();

		const es = connectSSE((event) => {
			if (
				[
					"idea.created",
					"idea.transition",
					"idea.scored",
					"gate.passed",
					"gate.failed",
					"agent.progress",
				].includes(event)
			) {
				load();
			}
		});
		return () => es.close();
	}, []);

	if (loading) {
		return (
			<Card className="overflow-hidden border-primary/10">
				<CardContent className="p-5">
					<div className="flex items-center gap-2 mb-4">
						<div className="shimmer w-5 h-5 rounded-full" />
						<div className="shimmer h-4 w-36 rounded" />
					</div>
					<div className="space-y-3">
						{[1, 2].map((i) => (
							<div
								key={i}
								className="flex items-center gap-3 p-3 rounded-lg border shimmer"
							>
								<div className="w-8 h-8 rounded-full shrink-0" />
								<div className="flex-1 space-y-1.5">
									<div className="h-3.5 w-3/4 rounded" />
									<div className="h-3 w-1/2 rounded" />
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	const activeIdea = status?.active_idea;
	const queuedIdeas = status?.queued_ideas || [];

	if (!activeIdea) {
		return (
			<Card className="overflow-hidden border-dashed border-primary/20 bg-muted/20">
				<CardContent className="p-5">
					<div className="flex items-center gap-2 mb-4">
						<Activity className="w-3.5 h-3.5 text-muted-foreground" />
						<h3 className="text-sm font-semibold flex items-center gap-1.5">
							Single-Idea Focus
							<span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
								idle
							</span>
						</h3>
						<Badge variant="outline" className="ml-auto text-[10px] h-5 gap-1">
							Queue: {status?.queued_count || 0}
						</Badge>
					</div>

					<p className="text-sm text-muted-foreground">
						No idea is actively being processed right now. The scheduler will
						pick the next queued idea and work on it alone.
					</p>

					{queuedIdeas.length > 0 && (
						<div className="mt-3 space-y-2">
							{queuedIdeas.slice(0, 3).map((idea) => (
								<div
									key={idea.idea_id}
									className="flex items-center justify-between gap-3 p-2 rounded-md border bg-card/60 text-xs"
								>
									<div className="min-w-0">
										<p className="font-medium truncate">{idea.title}</p>
										<p className="text-muted-foreground capitalize truncate">
											{idea.state?.replace(/_/g, " ")} · {idea.phase}
										</p>
									</div>
									<Badge variant="outline" className="text-[10px] h-5">
										queued
									</Badge>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
			<CardContent className="p-5">
				{/* Header */}
				<div className="flex items-center gap-2 mb-4">
					<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
					<h3 className="text-sm font-semibold flex items-center gap-1.5">
						Single-Idea Focus
						<span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
							1 active
						</span>
					</h3>
					<Badge variant="outline" className="ml-auto text-[10px] h-5 gap-1">
						<Activity className="w-3 h-3" />
						Queue: {status?.queued_count || 0}
					</Badge>
				</div>

				{/* Active idea card */}
				<div className="space-y-2">
					<Link to={`/ideas/${activeIdea.idea_id}`} className="block group">
						<div className="flex items-start gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-sm shimmer-slow">
							<div className="relative shrink-0 mt-0.5">
								<div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">
									{AGENT_ICONS[activeIdea.phase] || "🤖"}
								</div>
								<span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
							</div>

							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-0.5 flex-wrap">
									<span className="text-[11px] font-mono text-muted-foreground">
										{activeIdea.idea_id}
									</span>
									<Badge
										variant="secondary"
										className="text-[10px] h-5 px-1.5 font-normal gap-1"
									>
										<Bot className="w-2.5 h-2.5" />
										{activeIdea.active_agent ||
											activeIdea.running_agent ||
											"processing"}
									</Badge>
									<Badge
										variant="outline"
										className="text-[10px] h-5 capitalize"
									>
										{activeIdea.active_state || activeIdea.state}
									</Badge>
								</div>
								<p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
									{activeIdea.title}
								</p>
								<p className="text-[11px] text-muted-foreground mt-1">
									{activeIdea.active_message ||
										"Agent is actively processing this idea."}
								</p>
							</div>

							<div className="flex flex-col items-end gap-1 shrink-0">
								<span className="text-xs font-mono font-semibold tabular-nums">
									{activeIdea.composite_score}
								</span>
								<ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
							</div>
						</div>
					</Link>

					{queuedIdeas.length > 0 && (
						<div className="text-[11px] text-muted-foreground px-1">
							{queuedIdeas.length} idea(s) waiting their turn. The scheduler now
							keeps one active idea at a time.
						</div>
					)}
				</div>

				{/* Footer pulse */}
				<div className="flex items-center gap-2 mt-3 pt-3 border-t text-[11px] text-muted-foreground">
					<Sparkles className="w-3 h-3 text-emerald-500" />
					<span className="shimmer-text text-xs font-medium">
						Live active-agent tracking enabled
					</span>
				</div>
			</CardContent>
		</Card>
	);
}
