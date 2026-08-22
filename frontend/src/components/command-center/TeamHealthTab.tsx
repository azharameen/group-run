import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, MoonStar, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
	evaluateOrganization,
	fetchOrganizationAlerts,
	fetchOrganizationHealth,
	fetchOrganizations,
} from "@/api/client";
import type {
	EvaluationResult,
	OrganizationHealth,
	OrgAlert,
	TeamHealth,
	WorkloadState,
} from "@/api/client";

const workloadBadge: Record<WorkloadState, { label: string; className: string }> = {
	idle: { label: "idle", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
	active: { label: "active", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
	overloaded: { label: "overloaded", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
};

function TeamHealthCard({ team }: { team: TeamHealth }) {
	const badge = workloadBadge[team.workload_state];
	return (
		<Card
			data-testid={`team-health-card-${team.team_id}`}
			className={cn(
				"border",
				team.workload_state === "overloaded" && "border-red-500/60 bg-red-500/5",
				team.workload_state === "idle" && "border-emerald-500/40 bg-emerald-500/5",
			)}
		>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{team.name}</CardTitle>
				<Badge data-testid={`team-health-state-${team.team_id}`} variant="outline" className={badge.className}>
					{team.workload_state === "overloaded" && <AlertTriangle className="mr-1 h-3 w-3" />}
					{team.workload_state === "idle" && <MoonStar className="mr-1 h-3 w-3" />}
					{team.workload_state === "active" && <Activity className="mr-1 h-3 w-3" />}
					{badge.label}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-1 text-xs text-muted-foreground">
				<div className="flex items-center gap-1.5">
					<Users className="h-3.5 w-3.5" />
					<span>
						{team.active_agents} active / {team.idle_agents} idle of {team.total_agents} agents
					</span>
				</div>
				<div>
					{team.open_work_items} open work item{team.open_work_items === 1 ? "" : "s"}
				</div>
			</CardContent>
		</Card>
	);
}

export default function TeamHealthTab() {
	const [health, setHealth] = useState<OrganizationHealth | null>(null);
	const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [alerts, setAlerts] = useState<OrgAlert[]>([]);
	const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
	const [evaluating, setEvaluating] = useState(false);
	const [evaluationError, setEvaluationError] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const organizations = await fetchOrganizations();
			if (organizations.length === 0) {
				setHasOrganization(false);
				setHealth(null);
				return;
			}
			// The list is sorted by updated_at DESC, so the most recently
			// updated organization is the active one.
			const orgId = organizations[0].org_id;
			setHasOrganization(true);
			const [healthSnapshot, existingAlerts] = await Promise.all([
				fetchOrganizationHealth(orgId),
				fetchOrganizationAlerts(orgId),
			]);
			setHealth(healthSnapshot);
			setAlerts(existingAlerts);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load team health");
		} finally {
			setLoading(false);
		}
	}, []);

	const runEvaluation = useCallback(async () => {
		if (health === null) return;
		setEvaluating(true);
		setEvaluationError(null);
		try {
			const result = await evaluateOrganization(health.org_id);
			setEvaluation(result);
			const [freshHealth, freshAlerts] = await Promise.all([
				fetchOrganizationHealth(health.org_id),
				fetchOrganizationAlerts(health.org_id),
			]);
			setHealth(freshHealth);
			setAlerts(freshAlerts);
		} catch (err) {
			setEvaluationError(err instanceof Error ? err.message : "Failed to evaluate organization");
		} finally {
			setEvaluating(false);
		}
	}, [health]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	if (error) {
		return (
			<div data-testid="team-health-error" className="p-6 space-y-3 text-sm">
				<div className="flex items-center gap-2 text-destructive">
					<AlertTriangle className="w-4 h-4" />
					<span className="font-medium">Failed to load team health</span>
				</div>
				<p className="text-muted-foreground">{error}</p>
				<Button size="sm" onClick={() => void loadData()}>
					Retry
				</Button>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="p-4 space-y-3" data-testid="team-health-loading">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}

	if (hasOrganization === false || health === null) {
		return (
			<div data-testid="team-health-empty" className="p-6 space-y-2 text-sm">
				<Users className="w-8 h-8 text-muted-foreground" />
				<p className="font-medium">No organization yet</p>
				<p className="text-muted-foreground">
					Team capacity and workload appear here once an organization exists.
				</p>
			</div>
		);
	}

	return (
		<div data-testid="team-health-tab" className="p-4 space-y-4">
			<div className="flex items-center justify-between gap-2">
				<div className="text-xs text-muted-foreground">
					{health.total_open_work_items} open work item
					{health.total_open_work_items === 1 ? "" : "s"} across {health.departments.length} department
					{health.departments.length === 1 ? "" : "s"}
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={evaluating}
					onClick={() => void runEvaluation()}
					data-testid="team-health-evaluate"
				>
					{evaluating ? "Evaluating..." : "Evaluate organization"}
				</Button>
			</div>

			{evaluationError !== null && (
				<div
					className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					data-testid="team-health-evaluation-error"
				>
					{evaluationError}
				</div>
			)}

			{evaluation !== null && (
				<Card className="mb-4" data-testid="team-health-evaluation">
					<CardHeader>
						<CardTitle className="text-base">Evaluation results</CardTitle>
						<CardDescription>
							{evaluation.actions.length} reassignment
							{evaluation.actions.length === 1 ? "" : "s"}, {evaluation.alerts.length} new alert
							{evaluation.alerts.length === 1 ? "" : "s"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{evaluation.actions.length === 0 && evaluation.alerts.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No reassignments or escalations were needed.
							</p>
						)}
						{evaluation.actions.map((action) => (
							<div
								key={action.work_item_id}
								className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
								data-testid={`team-health-action-${action.work_item_id}`}
							>
								<Badge variant="secondary">Reassigned</Badge>
								<span className="font-mono text-xs">{action.work_item_id}</span>
								<span className="text-muted-foreground">
									{action.from_agent_id} → {action.to_agent_id}
								</span>
								<span className="text-muted-foreground">{action.reason}</span>
							</div>
						))}
						{evaluation.alerts.map((alert) => (
							<div
								key={alert.alert_id}
								className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
								data-testid={`team-health-alert-${alert.alert_id}`}
							>
								<Badge variant="destructive">Escalated</Badge>
								<span className="font-mono text-xs">{alert.work_item_id}</span>
								<span className="text-muted-foreground">
									stuck in {alert.phase}
								</span>
								<span className="text-muted-foreground">{alert.reason}</span>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{alerts.length > 0 && (
				<Card className="mb-4">
					<CardHeader>
						<CardTitle className="text-base">Escalation alerts</CardTitle>
						<CardDescription>
							Work items that have been escalated for attention
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{alerts.map((alert) => (
							<div
								key={alert.alert_id}
								className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
								data-testid={`team-health-alert-${alert.alert_id}`}
							>
								<Badge variant="destructive">Escalated</Badge>
								<span className="font-mono text-xs">{alert.work_item_id}</span>
								<span className="text-muted-foreground">
									stuck in {alert.phase}
								</span>
								<span className="text-muted-foreground">{alert.reason}</span>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{health.departments.map((department) => (
				<div key={department.department_id} className="space-y-2">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{department.name}
					</h3>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{department.teams.map((team) => (
							<TeamHealthCard key={team.team_id} team={team} />
						))}
					</div>
				</div>
			))}
		</div>
	);
}
