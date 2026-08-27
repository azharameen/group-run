import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fetchOrganizations, fetchWorkItems } from "@/api/client";
import {
	createReview, fetchLifecycleHistory, listDecisions, listReviews,
	transitionWorkItem, LIFECYCLE_PHASES,
	saveWorkItemTemplate, fetchTemplates, replayTemplate,
} from "@/api/workItems";
import type { AccuracyReview, DecisionRecord, LifecycleEvent, WorkItem, WorkflowTemplate } from "@/api/workItems";

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
	const [decisionOpen, setDecisionOpen] = useState(false);
	const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
	const [decisionError, setDecisionError] = useState<string | null>(null);
	const [advancing, setAdvancing] = useState(false);
	const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
	const [templateName, setTemplateName] = useState("");
	const [savingTemplate, setSavingTemplate] = useState(false);
	const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [reviews, setReviews] = useState<AccuracyReview[]>([]);
	const [reviewError, setReviewError] = useState<string | null>(null);
	const [reviewScore, setReviewScore] = useState("");
	const [reviewSummary, setReviewSummary] = useState("");
	const [reviewer, setReviewer] = useState("user");
	const [submittingReview, setSubmittingReview] = useState(false);
	const latestReview = reviews.length > 0 ? reviews[reviews.length - 1] : undefined;
	const statusIndex = lifecyclePhases.indexOf(item.status as never);
	const next = statusIndex >= 0 ? lifecyclePhases[statusIndex + 1] : undefined;
	const canSaveTemplate = item.status !== "new";
	
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
	const openDecisions = async (open: boolean) => {
		setDecisionOpen(open);
		if (!open) return;
		setDecisionError(null);
		try {
			setDecisions(await listDecisions({ work_item_id: item.work_item_id }));
		} catch (err) {
			setDecisions([]);
			setDecisionError(err instanceof Error ? err.message : "Failed to load decisions");
		}
	};
	const loadReviews = useCallback(async () => {
		try {
			setReviews(await listReviews(item.work_item_id));
			setReviewError(null);
		} catch (err) {
			setReviews([]);
			setReviewError(err instanceof Error ? err.message : "Failed to load reviews");
		}
	}, [item.work_item_id]);
	useEffect(() => {
		void loadReviews();
	}, [loadReviews]);
	const openReview = async (open: boolean) => {
		setReviewOpen(open);
		if (!open) return;
		await loadReviews();
	};
	const submitReview = async () => {
		if (submittingReview) return;
		const score = Number(reviewScore);
		if (!Number.isInteger(score) || score < 0 || score > 100) {
			setReviewError("Accuracy score must be a whole number between 0 and 100");
			return;
		}
		setSubmittingReview(true);
		setReviewError(null);
		try {
			await createReview(item.work_item_id, {
				reviewer: reviewer.trim() || "user",
				accuracy_score: score,
				summary: reviewSummary,
			});
			setReviewScore("");
			setReviewSummary("");
			await loadReviews();
		} catch (err) {
			setReviewError(err instanceof Error ? err.message : "Failed to submit review");
		} finally {
			setSubmittingReview(false);
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
	const saveAsTemplate = async () => {
		if (!templateName.trim() || savingTemplate) return;
		setSavingTemplate(true);
		setSaveTemplateError(null);
		try {
			await saveWorkItemTemplate(item.work_item_id, { name: templateName.trim() });
			setSaveTemplateOpen(false);
			setTemplateName("");
			onRefresh();
		} catch (err) {
			setSaveTemplateError(err instanceof Error ? err.message : "Failed to save template");
		} finally {
			setSavingTemplate(false);
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
				{latestReview?.flagged_for_review && (
					<Badge data-testid="work-item-flagged-badge" variant="destructive" className="shrink-0">
						Needs review
					</Badge>
				)}
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
			<div className="flex gap-2 flex-wrap">
				<Button size="sm" variant="outline" data-testid="work-item-history-button"
					onClick={() => void openHistory(true)}>History</Button>
				<Button size="sm" variant="outline" data-testid="work-item-decisions-button"
					onClick={() => void openDecisions(true)}>Decisions</Button>
				<Button size="sm" variant="outline" data-testid="work-item-review-button"
					onClick={() => void openReview(true)}>Review</Button>
				<Button size="sm" data-testid="work-item-advance-button" disabled={!next || advancing}
					onClick={() => void advance()}>Advance</Button>
				<Button size="sm" variant="outline" data-testid="work-item-template-button"
					disabled={!canSaveTemplate}
					onClick={() => void setSaveTemplateOpen(true)}>Save as template</Button>
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
			<Dialog open={decisionOpen} onOpenChange={(open) => void openDecisions(open)}>
				<DialogContent data-testid="work-item-decisions-dialog">
					<DialogHeader><DialogTitle>Decision history: {item.title}</DialogTitle></DialogHeader>
					{decisionError && <p data-testid="work-item-decisions-error" className="text-xs text-destructive">{decisionError}</p>}
					<div className="space-y-2 max-h-96 overflow-y-auto">
						{decisions.length === 0 && !decisionError && (
							<p data-testid="work-item-decisions-empty" className="text-sm text-muted-foreground">No decisions recorded.</p>
						)}
						{decisions.map((decision) => (
							<div key={decision.decision_id} data-testid="decision-row" className="rounded border p-2 text-xs space-y-1">
								<div><Badge>{decision.decision_type}</Badge> · {decision.agent_id} · confidence: {decision.confidence}</div>
								<div>{formatDate(decision.decided_at)}</div>
								<div>{decision.reasoning}</div>
								{decision.evidence.length > 0 && <div>Evidence: {decision.evidence.join(", ")}</div>}
								{decision.alternatives.length > 0 && <div>Alternatives: {decision.alternatives.join(", ")}</div>}
							</div>
						))}
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
				<DialogContent data-testid="template-name-dialog">
					<DialogHeader><DialogTitle>Save as template</DialogTitle></DialogHeader>
					<div className="space-y-4">
						<Input
							placeholder="Template name"
							value={templateName}
							onChange={(e) => setTemplateName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") void saveAsTemplate();
							}}
						/>
						{saveTemplateError && (
							<p className="text-xs text-destructive">{saveTemplateError}</p>
						)}
						<div className="flex gap-2 justify-end">
							<Button size="sm" variant="outline"
								onClick={() => { setSaveTemplateOpen(false); setTemplateName(""); }}>Cancel</Button>
							<Button size="sm" disabled={!templateName.trim() || savingTemplate}
								onClick={() => void saveAsTemplate()}>Save</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={reviewOpen} onOpenChange={(open) => void openReview(open)}>
				<DialogContent data-testid="work-item-review-dialog">
					<DialogHeader><DialogTitle>Accuracy review: {item.title}</DialogTitle></DialogHeader>
					{reviewError && <p data-testid="work-item-review-error" className="text-xs text-destructive">{reviewError}</p>}
					<div className="space-y-2 max-h-64 overflow-y-auto">
						{reviews.length === 0 && !reviewError && (
							<p data-testid="work-item-review-empty" className="text-sm text-muted-foreground">No reviews recorded.</p>
						)}
						{reviews.map((review) => (
							<div key={review.review_id} data-testid="review-row" className="rounded border p-2 text-xs space-y-1">
								<div>
									<Badge>{review.accuracy_score}</Badge> · {review.reviewer}
									{review.flagged_for_review && (
										<Badge data-testid="review-flagged-badge" variant="destructive" className="ml-1">
											Needs review
										</Badge>
									)}
								</div>
								<div>{formatDate(review.reviewed_at)}</div>
								<div>{review.summary}</div>
							</div>
						))}
					</div>
					<div className="space-y-2 border-t pt-2">
						<Input
							data-testid="work-item-review-score-input"
							type="number"
							min={0}
							max={100}
							placeholder="Accuracy score (0-100)"
							value={reviewScore}
							onChange={(event) => setReviewScore(event.target.value)}
						/>
						<Textarea
							data-testid="work-item-review-summary-input"
							placeholder="Review summary"
							value={reviewSummary}
							onChange={(event) => setReviewSummary(event.target.value)}
						/>
						<Input
							data-testid="work-item-review-reviewer-input"
							placeholder="Reviewer"
							value={reviewer}
							onChange={(event) => setReviewer(event.target.value)}
						/>
						<Button
							size="sm"
							data-testid="work-item-review-submit-button"
							disabled={submittingReview || !reviewScore || !reviewSummary.trim()}
							onClick={() => void submitReview()}
						>
							Submit review
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default function WorkItemsTab() {
	const [items, setItems] = useState<WorkItem[] | null>(null);
	const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
	const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [replayTemplateId, setReplayTemplateId] = useState<string | null>(null);
	const [replayTitle, setReplayTitle] = useState("");
	const [replayDescription, setReplayDescription] = useState("");
	const [replayOpen, setReplayOpen] = useState(false);
	const [replyingTemplate, setReplayingTemplate] = useState(false);
	const [replayError, setReplayError] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const organizations = await fetchOrganizations();
			if (organizations.length === 0) {
				setHasOrganization(false);
				setItems([]);
				setTemplates([]);
				return;
			}
			// The list is sorted by updated_at DESC, so the most recently
			// updated organization is the active one.
			setHasOrganization(true);
			const orgId = organizations[0].org_id;
			setItems(await fetchWorkItems(orgId));
			setTemplates(await fetchTemplates(orgId));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load work items");
		} finally {
			setLoading(false);
		}
	}, []);

	const doReplay = async () => {
		if (!replayTemplateId || !replayTitle.trim() || replyingTemplate) return;
		setReplayingTemplate(true);
		setReplayError(null);
		try {
			await replayTemplate(replayTemplateId, {
				title: replayTitle.trim(),
				description: replayDescription.trim(),
			});
			setReplayOpen(false);
			setReplayTemplateId(null);
			setReplayTitle("");
			setReplayDescription("");
			await loadData();
		} catch (err) {
			setReplayError(err instanceof Error ? err.message : "Failed to replay template");
		} finally {
			setReplayingTemplate(false);
		}
	};

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

	return (
		<div data-testid="work-items-tab" className="p-4 space-y-4">
			{/* Templates section */}
			{(templates === null || templates.length > 0) && (
				<div className="space-y-2">
					<div className="text-xs text-muted-foreground font-medium">
						Workflow Templates
					</div>
					{templates === null ? (
						<Skeleton className="h-12 w-full" />
					) : templates.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							No templates yet. Save a work item as a template to reuse its workflow.
						</p>
					) : (
						<div className="space-y-2">
							{templates.map((template) => (
								<div key={template.template_id} data-testid={`template-row-${template.template_id}`}
									className="rounded-md border bg-card p-3 text-sm space-y-2">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="font-medium text-foreground">{template.name}</p>
											<p className="text-xs text-muted-foreground">
												Ends at {template.phases[template.phases.length - 1]} · Used {template.usage_count} time{template.usage_count === 1 ? "" : "s"}
											</p>
										</div>
									</div>
									<Button size="sm" data-testid={`template-replay-${template.template_id}`}
										onClick={() => {
											setReplayTemplateId(template.template_id);
											setReplayOpen(true);
										}}>
										Replay
									</Button>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Work items section */}
			<div className="space-y-2">
				<div className="text-xs text-muted-foreground font-medium">
					Work Items
				</div>
				{items === null || items.length === 0 ? (
					<div data-testid="work-items-empty" className="text-xs text-muted-foreground">
						{items === null ? "Loading..." : "No work items yet. Work items submitted by the Chief of Staff will show up here."}
					</div>
				) : (
					<>
						<div className="text-xs text-muted-foreground">
							{items.length} work item{items.length === 1 ? "" : "s"} · newest first
						</div>
						{items.map((item) => (
							<WorkItemRow key={item.work_item_id} item={item} onRefresh={() => void loadData()} />
						))}
					</>
				)}
			</div>

			{/* Replay dialog */}
			<Dialog open={replayOpen} onOpenChange={setReplayOpen}>
				<DialogContent data-testid="template-replay-dialog">
					<DialogHeader><DialogTitle>Replay template</DialogTitle></DialogHeader>
					<div className="space-y-4">
						<div>
							<label className="text-xs font-medium">Title</label>
							<Input
								placeholder="New work item title"
								value={replayTitle}
								onChange={(e) => setReplayTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void doReplay();
								}}
							/>
						</div>
						<div>
							<label className="text-xs font-medium">Description (optional)</label>
							<Input
								placeholder="Description"
								value={replayDescription}
								onChange={(e) => setReplayDescription(e.target.value)}
							/>
						</div>
						{replayError && (
							<p className="text-xs text-destructive">{replayError}</p>
						)}
						<div className="flex gap-2 justify-end">
							<Button size="sm" variant="outline"
								onClick={() => {
									setReplayOpen(false);
									setReplayTemplateId(null);
									setReplayTitle("");
									setReplayDescription("");
								}}>Cancel</Button>
							<Button size="sm" disabled={!replayTitle.trim() || replyingTemplate}
								onClick={() => void doReplay()}>Replay</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
