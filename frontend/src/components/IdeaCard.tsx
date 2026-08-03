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

export default function IdeaCard({ idea }: { idea: IdeaListItem }) {
	const colorKey = idea.phase?.toLowerCase() || "discovery";

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
