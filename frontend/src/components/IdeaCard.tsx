import { Link } from "react-router-dom";
import type { IdeaListItem } from "../api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2 } from "lucide-react";

const PHASE_VARIANTS: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	discovery: "outline",
	research: "secondary",
	analysis: "default",
	drafting: "secondary",
	review: "destructive",
	done: "outline",
};

const STRENGTH_BADGE_STYLE: Record<string, string> = {
	"Very Strong":
		"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
	Strong:
		"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
	Moderate:
		"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
	Weak: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300",
	Reject:
		"bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300",
};

function ScoreBadge({ score }: { score: number }) {
	let colorClass = "bg-slate-100 text-slate-700 border-slate-200";
	if (score >= 85)
		colorClass =
			"bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200";
	else if (score >= 70)
		colorClass =
			"bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/60 dark:text-blue-200";
	else if (score >= 50)
		colorClass =
			"bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/60 dark:text-amber-200";
	else if (score >= 30)
		colorClass =
			"bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/60 dark:text-orange-200";
	else
		colorClass =
			"bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/60 dark:text-rose-200";

	return (
		<div
			className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border shadow-xs ${colorClass}`}
		>
			Score: {score}
		</div>
	);
}

export default function IdeaCard({ idea }: { idea: IdeaListItem }) {
	const colorKey = idea.phase?.toLowerCase() || "discovery";
	const ratingStyle = STRENGTH_BADGE_STYLE[idea.strength_rating] || "";

	return (
		<Link to={`/ideas/${idea.idea_id}`} className="block group">
			<Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/50">
				<CardHeader className="p-5 pb-3">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex items-center gap-2">
								<span className="text-xs font-mono text-muted-foreground">
									{idea.idea_id}
								</span>
						{idea.active_processing && (
							<Badge
								variant="default"
								className="text-[10px] h-5 gap-1 font-normal bg-emerald-600 hover:bg-emerald-600"
							>
								<Loader2 className="w-2.5 h-2.5 animate-spin" />
								Working
							</Badge>
						)}
						{idea.paused_processing && !idea.active_processing && (
							<Badge
								variant="outline"
								className="text-[10px] h-5 gap-1 font-normal"
							>
								Paused
							</Badge>
						)}
						{idea.running_agent && !idea.active_processing && (
									<Badge
										variant="secondary"
										className="text-[10px] h-5 gap-1 font-normal"
									>
										<span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
										{idea.running_agent}
									</Badge>
								)}
							</div>
							<CardTitle className="text-base font-semibold group-hover:text-primary transition-colors line-clamp-2">
								{idea.title}
							</CardTitle>
						</div>
						<ScoreBadge score={idea.composite_score} />
					</div>
				</CardHeader>
				<CardContent className="p-5 pt-2 space-y-4">
					<div className="flex flex-wrap items-center gap-2 text-xs">
						<Badge variant="outline" className="capitalize">
							{idea.phase}
						</Badge>
						<span className="text-muted-foreground">•</span>
						<span className="text-muted-foreground capitalize">
							{idea.state?.replace(/_/g, " ")}
						</span>
						{ratingStyle && (
							<>
								<span className="text-muted-foreground">•</span>
								<span
									className={`px-2 py-0.5 rounded text-[11px] font-medium border ${ratingStyle}`}
								>
									{idea.strength_rating}
								</span>
							</>
						)}
					</div>

					<div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
						<span>
							{idea.updated_at
								? new Date(idea.updated_at).toLocaleDateString()
								: "Recent"}
						</span>
						<span className="flex items-center gap-1 font-medium group-hover:translate-x-0.5 transition-transform text-primary">
							View Details
							<ArrowRight className="w-3.5 h-3.5" />
						</span>
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}
