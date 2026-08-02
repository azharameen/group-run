import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, TrendingUp, Shield, BarChart3 } from "lucide-react";
import type { Stats, WorkflowConfig } from "@/api/client";
import { PHASE_COLORS } from "@/lib/theme-utils";

interface DashboardStatsCardsProps {
	stats: Stats | null;
	workflowConfig: WorkflowConfig | null;
}

export function DashboardStatsCards({ stats, workflowConfig }: DashboardStatsCardsProps) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
			<Card>
				<CardContent className="p-5">
					<div className="flex items-center gap-2 text-muted-foreground mb-1">
						<Lightbulb className="w-4 h-4 text-amber-500" />
						<span className="text-xs font-medium">Total Ideas</span>
					</div>
					<p className="text-3xl font-bold tracking-tight">{stats?.total_ideas || 0}</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-5">
					<div className="flex items-center gap-2 text-muted-foreground mb-1">
						<TrendingUp className="w-4 h-4 text-blue-500" />
						<span className="text-xs font-medium">Avg Composite Score</span>
					</div>
					<p className="text-3xl font-bold tracking-tight">{stats?.average_score || 0}</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-5">
					<div className="flex items-center gap-2 text-muted-foreground mb-1">
						<Shield className="w-4 h-4 text-emerald-500" />
						<span className="text-xs font-medium">Above Gate Threshold</span>
					</div>
					<p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
						{stats?.ideas_above_threshold || 0}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-5">
					<div className="flex items-center gap-2 text-muted-foreground mb-1">
						<BarChart3 className="w-4 h-4 text-primary" />
						<span className="text-xs font-medium">Phase Breakdown</span>
					</div>
					<div className="flex gap-1.5 mt-3">
						{Object.entries(workflowConfig?.phases || { discovery: { label: 'Discovery', color: 'amber' } }).map(([key]) => {
							const count = stats?.by_phase?.[key] || 0;
							const total = stats?.total_ideas || 1;
							return (
								<div
									key={key}
									className="group relative flex-1 h-3 rounded-full overflow-hidden bg-muted"
								>
									<div
										className={`h-full rounded-full ${PHASE_COLORS[key] || 'bg-slate-500'} transition-all`}
										style={{ width: `${(count / total) * 100}%` }}
									/>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
