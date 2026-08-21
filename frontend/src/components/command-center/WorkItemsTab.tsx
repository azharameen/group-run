import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchOrganizations, fetchWorkItems } from "../../api/client";
import {
	fetchLifecycleHistory, transitionWorkItem, LIFECYCLE_PHASES,
} from "@/api/workItems";
import type { LifecycleEvent, WorkItem } from "@/api/workItems";

const lifecyclePhases = LIFECYCLE_PHASES ?? [
	"new", "ideation", "product_definition", "development", "testing", "deployment", "monitoring",
] as const;

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString();
}

function WorkItemRow({ item, onRefresh }: { item: WorkItem; onRefresh: () => void }) {
	const [historyOpen, setHistoryOpen] = useState(false);
	const [events, setEvents] = useState<LifecycleEvent[]>([]);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [advanceError, setAdvanceError] = useState<string | null>(null);
	const [advancing, setAdvancing] = useState(false);
	const statusIndex = lifecyclePhases.indexOf(item.status as never);
	const next = statusIndex >= 0 ? lifecyclePhases[statusIndex + 1] : undefined;
	const openHistory = async (open: boolean) => {
		setHistoryOpen(open);
		if (!open) return;
		setHistoryError(null);
		try {
			setEvents(await fetchLifecycleHistory(item.work_item_id));
		} catch (err) {
			setEvents([]);
			setHistoryError(err instanceof Error ? err.message : "Failed to load lifecycle history");
		}
	};
	const advance = async () => {
		if (!next || advancing) return;
		setAdvancing(true);
		setAdvanceError(null);
		try {
			await transitionWorkItem(item.work_item_id, { status: next });
			onRefresh();
		} catch (err) {
			setAdvanceError(err instanceof Error ? err.message : "Advance failed");
		} finally {
			setAdvancing(false);
		}
	};
	return (
		<div
			data-testid="work-item-row"
			className="rounded-md border bg-card p-3 text-sm space-y-2"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="font-medium text-foreground break-words">{item.title}</p>
					{item.description && (
						<p className="text-xs text-muted-foreground break-words">
							{item.description}
						</p>
					)}
				</div>
				<Badge data-testid="work-item-status" variant="secondary" className="shrink-0">
					{item.status}
				</Badge>
			</div>
			<div
				data-testid="work-item-routing"
				className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
			>
				<span className="font-medium text-foreground">
					Routed to: {item.routing.department_id}
				</span>
				<span>
					confidence: {item.routing.confidence}
				</span>
				<span>
					decided by {item.routing.decided_by} · {formatDate(item.routing.decided_at)}
				</span>
				<span className="italic">— {item.routing.reasoning}</span>
			</div>
			<div className="text-[11px] text-muted-foreground">
				by {item.owner_agent_id} · {formatDate(item.created_at)}
			</div>
			<div className="flex gap-2">
				<Button size="sm" variant="outline" data-testid="work-item-history-button"
					onClick={() => void openHistory(true)}>History</Button>
				<Button size="sm" data-testid="work-item-advance-button" disabled={!next || advancing}
					onClick={() => void advance()}>Advance</Button>
			</div>
			{advanceError && (
				<p data-testid="work-item-advance-error" className="text-xs text-destructive">
					{advanceError}
				</p>
			)}
			<Dialog open={historyOpen} onOpenChange={(open) => void openHistory(open)}>
				<DialogContent data-testid="work-item-history-dialog">
					<DialogHeader><DialogTitle>Lifecycle history: {item.title}</DialogTitle></DialogHeader>
					{historyError && (
						<p data-testid="work-item-history-error" className="text-xs text-destructive">
							{historyError}
						</p>
					)}
					<div className="space-y-2 max-h-96 overflow-y-auto">
						{events.map((event) => (
							<div key={event.event_id} data-testid="lifecycle-event-row"
								className="rounded border p-2 text-xs space-y-1">
								<div><Badge>{event.event_type}</Badge> {event.from_status || "—"} → {event.to_status}</div>
								<div>{event.from_department || "—"} → {event.to_department} · {event.decided_by}</div>
								<div>{formatDate(event.decided_at)} · confidence: {event.confidence}</div>
								<div>{event.reasoning}</div>
							</div>
						))}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default function WorkItemsTab() {
	const [items, setItems] = useState<WorkItem[] | null>(null);
	const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const organizations = await fetchOrganizations();
			if (organizations.length === 0) {
				setHasOrganization(false);
				setItems([]);
				return;
			}
			// The list is sorted by updated_at DESC, so the most recently
			// updated organization is the active one.
			setHasOrganization(true);
			setItems(await fetchWorkItems(organizations[0].org_id));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load work items");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	if (error) {
		return (
			<div data-testid="work-items-error" className="p-6 space-y-3 text-sm">
				<div className="flex items-center gap-2 text-destructive">
					<AlertTriangle className="w-4 h-4" />
					<span className="font-medium">Failed to load work items</span>
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
			<div className="p-4 space-y-3" data-testid="work-items-loading">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		);
	}

	if (hasOrganization === false) {
		return (
			<div data-testid="work-items-empty" className="p-6 space-y-2 text-sm">
				<ListChecks className="w-8 h-8 text-muted-foreground" />
				<p className="font-medium">No organization yet</p>
				<p className="text-muted-foreground">
					Work items appear here once an organization exists.
				</p>
			</div>
		);
	}

	if (items === null || items.length === 0) {
		return (
			<div data-testid="work-items-empty" className="p-6 space-y-2 text-sm">
				<ListChecks className="w-8 h-8 text-muted-foreground" />
				<p className="font-medium">No work items yet</p>
				<p className="text-muted-foreground">
					Work items submitted by the Chief of Staff will show up here.
				</p>
			</div>
		);
	}

	return (
		<div data-testid="work-items-tab" className="p-4 space-y-3">
			<div className="text-xs text-muted-foreground">
				{items.length} work item{items.length === 1 ? "" : "s"} · newest first
			</div>
			{items.map((item) => (
				<WorkItemRow key={item.work_item_id} item={item} onRefresh={() => void loadData()} />
			))}
		</div>
	);
}
