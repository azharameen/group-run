import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
	RefreshCw,
	Send,
	Loader2,
	FileText,
	Target,
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Lightbulb,
	Search,
	Shield,
	Zap,
	BarChart3,
	BookOpen,
	ClipboardCheck,
	Users,
	Scale,
	Globe,
	MessageSquare,
	Folder,
	Trash2,
	Pause,
	Play,
	SendHorizonal,
	Bot,
	MoreVertical,
} from "lucide-react";
import {
	fetchIdeaDetail,
	fetchIdeaFiles,
	fetchIdeaRevisions,
	scoreIdea,
	advanceIdea,
	deleteIdea,
	pauseIdea,
	resumeIdea,
	addIdeaComment,
	fetchGateConfig,
	fetchCriteriaConfig,
	connectSSE,
	type IdeaDetail as IdeaDetailType,
	type IdeaFile,
	type GateConfig,
} from "../api/client";

import ScoreRadar from "../components/ScoreRadar";
import SiemensGateStatus from "../components/SiemensGateStatus";
import { IdeaHistoryTimeline } from "../components/IdeaHistoryTimeline";
import { IdeaFilesystem } from "../components/IdeaFilesystem";
import { InterruptInbox } from "../components/deepagents/InterruptInbox";
import { SubagentActivityCard } from "../components/deepagents/SubagentActivityCard";
import { AgentTodoPanel } from "../components/deepagents/AgentTodoPanel";
import { ToolCallTimeline } from "../components/deepagents/ToolCallTimeline";
import { ArtifactDiffPanel } from "../components/deepagents/ArtifactDiffPanel";
import { fetchPendingInterrupts } from "../api/deepagents";
import { InterruptItem, type SubagentStatus } from "../types/deepagents";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const STRENGTH_VARIANTS: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	"Very Strong": "default",
	Strong: "default",
	Moderate: "secondary",
	Weak: "outline",
	Reject: "destructive",
};

const CRITERION_LABELS: Record<string, string> = {
	novelty: "Novelty",
	siemens_alignment: "Siemens Alignment",
	technical_feasibility: "Technical Feasibility",
	detectability: "Detectability",
	business_value: "Business Value",
	originality: "Originality",
	completeness: "Completeness",
};

function ResearchSection({
	title,
	icon: Icon,
	data,
}: {
	title: string;
	icon: any;
	data: any;
}) {
	if (!data) return null;
	const [open, setOpen] = useState(false);

	const renderValue = (value: any): string => {
		if (typeof value === "string") return value;
		if (Array.isArray(value))
			return value.map((v) => renderValue(v)).join(", ");
		if (typeof value === "object" && value !== null)
			return JSON.stringify(value, null, 2);
		return String(value);
	};

	return (
		<Card>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger asChild>
					<CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-4">
						<div className="flex items-center justify-between">
							<CardTitle className="flex items-center gap-2 text-sm">
								<Icon className="w-4 h-4 text-primary" />
								{title}
							</CardTitle>
							{open ? (
								<ChevronDown className="w-4 h-4 text-muted-foreground" />
							) : (
								<ChevronRight className="w-4 h-4 text-muted-foreground" />
							)}
						</div>
					</CardHeader>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="p-4 pt-0">
						{typeof data === "object" && !Array.isArray(data) ? (
							<div className="space-y-2 text-xs">
								{Object.entries(data).map(([key, value]) => (
									<div key={key}>
										<span className="font-medium text-muted-foreground capitalize">
											{key.replace(/_/g, " ")}:
										</span>{" "}
										<span className="text-foreground">
											{renderValue(value)}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-foreground">{renderValue(data)}</p>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}

export default function IdeaDetail({
	onIdeaLoaded,
}: {
	onIdeaLoaded?: (title: string) => void;
}) {
	const { ideaId } = useParams<{ ideaId: string }>();
	const [detail, setDetail] = useState<IdeaDetailType | null>(null);
	const [files, setFiles] = useState<IdeaFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [scoring, setScoring] = useState(false);
	const [advancing, setAdvancing] = useState(false);
	const [pausing, setPausing] = useState(false);
	const [resuming, setResuming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [savingComment, setSavingComment] = useState(false);
	const [error, setError] = useState("");
	const [gateConfig, setGateConfig] = useState<GateConfig | null>(null);
	const [compositeThreshold, setCompositeThreshold] = useState(70);
	const [interrupts, setInterrupts] = useState<InterruptItem[]>([]);
	const [revisions, setRevisions] = useState<any[]>([]);
	const transcriptEvents =
		detail?.transcript_events || detail?.transcript || [];
	const approvalTranscriptEvents = transcriptEvents.filter((evt: any) =>
		["approval", "interrupt", "retry", "failed"].includes(evt?.type),
	);
	const toolCallEvents = transcriptEvents.filter((evt: any) =>
		["tool_call", "tool_result"].includes(evt?.type),
	);
	const subagentEvents: SubagentStatus[] = transcriptEvents
		.filter((evt: any) => ["subagent", "handover"].includes(evt?.type))
		.map((evt: any, idx: number) => ({
			id: evt.id || `subagent-${idx}`,
			name: evt.speaker || evt.agent || "Runtime Subagent",
			role: evt.role || "subagent",
			status:
				evt.type === "handover"
					? ("completed" as const)
					: evt.type === "subagent"
						? ("running" as const)
						: ("idle" as const),
			current_task: evt.action || evt.content || evt.reason || "",
			last_active: evt.timestamp,
		}));

	const loadData = async () => {
		if (!ideaId) return;
		try {
			const [detailRes, filesRes, revisionsRes, interruptsRes] = await Promise.all([
				fetchIdeaDetail(ideaId),
				fetchIdeaFiles(ideaId).catch(() => []),
				fetchIdeaRevisions(ideaId).catch(() => []),
				fetchPendingInterrupts(ideaId).catch(() => []),
			]);
			setDetail(detailRes);
			setFiles(filesRes);
			setRevisions(revisionsRes);
			setInterrupts(interruptsRes);
			if (detailRes?.idea?.title && onIdeaLoaded) {
				onIdeaLoaded(detailRes.idea.title);
			}
		} catch (err: any) {
			setError(err.message);
		}
		setLoading(false);
	};

	useEffect(() => {
		fetchGateConfig()
			.then(setGateConfig)
			.catch(() => {});
		fetchCriteriaConfig()
			.then((cfg) => {
				if (cfg?.thresholds?.composite_threshold)
					setCompositeThreshold(cfg.thresholds.composite_threshold);
			})
			.catch(() => {});
	}, []);

	useEffect(() => {
		loadData();
		if (!ideaId) return;
		const es = connectSSE((event) => {
			if (
				["idea.scored", "idea.transition", "agent.progress"].includes(event)
			) {
				loadData();
			}
		});
		return () => es.close();
	}, [ideaId]);

	const handleScore = async () => {
		if (!ideaId) return;
		setScoring(true);
		try {
			await scoreIdea(ideaId);
			await loadData();
		} catch (err: any) {
			console.error(err);
		}
		setScoring(false);
	};

	const handleAdvance = async (target?: string) => {
		if (!ideaId) return;
		setAdvancing(true);
		try {
			await advanceIdea(ideaId, target);
			await loadData();
		} catch (err: any) {
			console.error(err);
		}
		setAdvancing(false);
	};

	const handleDelete = async () => {
		if (!ideaId) return;
		if (!window.confirm("Delete this idea and all files?")) return;
		setDeleting(true);
		try {
			const result = await deleteIdea(ideaId);
			if (result.deleted) {
				window.location.href = "/";
				return;
			}
			await loadData();
			window.alert(result.message || "Delete request submitted for approval.");
		} catch (err: any) {
			console.error(err);
		}
		setDeleting(false);
	};

	const handlePause = async () => {
		if (!ideaId) return;
		setPausing(true);
		try {
			await pauseIdea(ideaId);
			await loadData();
		} catch (err: any) {
			console.error(err);
		}
		setPausing(false);
	};

	const handleResume = async () => {
		if (!ideaId) return;
		setResuming(true);
		try {
			await resumeIdea(ideaId);
			await loadData();
		} catch (err: any) {
			console.error(err);
		}
		setResuming(false);
	};

	const handleComment = async () => {
		if (!ideaId || !commentText.trim()) return;
		setSavingComment(true);
		try {
			await addIdeaComment(ideaId, commentText.trim());
			setCommentText("");
			await loadData();
		} catch (err: any) {
			console.error(err);
		}
		setSavingComment(false);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader2 className="w-8 h-8 animate-spin text-primary" />
			</div>
		);
	}

	if (error || !detail) {
		return (
			<div className="text-center py-16">
				<AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
				<p className="text-destructive font-medium">
					{error || "Idea not found"}
				</p>
				<Button variant="link" asChild className="mt-2">
					<Link to="/">Back to Dashboard</Link>
				</Button>
			</div>
		);
	}

	const idea = detail.idea;
	const stateData = detail.state;
	const scoresData = detail.scores;
	const latestScores = scoresData?.latest || {};
	const breakdown = latestScores?.breakdown || {};
	const composite = latestScores?.composite || 0;
	const strengthRating = latestScores?.strength_rating || "";
	const currentState = idea?.current_state || stateData?.current_state || "";
	const pausedProcessing = Boolean(idea?.paused_processing);

	return (
		<div className="space-y-6">
			{/* Header Info & Primary Actions */}
			<div className="relative p-6 rounded-xl border bg-card text-card-foreground shadow-sm">
				<div className="flex flex-col gap-4">
					{/* Title on top */}
					<h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight pr-10">
						{idea?.title || ideaId}
					</h1>

					{/* Metadata details underneath */}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
						<div className="flex items-center gap-1.5">
							<span className="font-semibold text-foreground">ID:</span>
							<span className="font-mono text-primary font-medium">{ideaId}</span>
						</div>
						<Separator orientation="vertical" className="h-3" />
						<div className="flex items-center gap-1.5">
							<span className="font-semibold text-foreground">Phase:</span>
							<Badge variant="outline" className="capitalize text-[11px] px-2 py-0">
								{idea?.phase || stateData?.phase || "discovery"}
							</Badge>
						</div>
						<Separator orientation="vertical" className="h-3" />
						<div className="flex items-center gap-1.5">
							<span className="font-semibold text-foreground">Status:</span>
							<span className="font-medium text-foreground capitalize bg-muted/60 px-2 py-0.5 rounded">
								{currentState.replace(/_/g, " ")}
							</span>
						</div>
					</div>
				</div>

				{/* 3 vertical ellipsis dropdown options on the top right corner */}
				<div className="absolute top-4 right-4">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
								<MoreVertical className="h-4 w-4" />
								<span className="sr-only">More options</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem
								onClick={pausedProcessing ? handleResume : handlePause}
								disabled={pausing || resuming}
								className="gap-2 cursor-pointer"
							>
								{pausedProcessing ? (
									<>
										<Play className="w-4 h-4 text-emerald-500" />
										<span>Resume Processing</span>
									</>
								) : (
									<>
										<Pause className="w-4 h-4 text-amber-500" />
										<span>Pause Processing</span>
									</>
								)}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleScore}
								disabled={scoring}
								className="gap-2 cursor-pointer"
							>
								<RefreshCw className={`w-4 h-4 text-blue-500 ${scoring ? "animate-spin" : ""}`} />
								<span>Re-Score Idea</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleAdvance()}
								disabled={advancing}
								className="gap-2 cursor-pointer"
							>
								{advancing ? (
									<Loader2 className="w-4 h-4 animate-spin text-primary" />
								) : (
									<Send className="w-4 h-4 text-indigo-500" />
								)}
								<span>Advance Cycle</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleDelete}
								disabled={deleting}
								className="gap-2 cursor-pointer text-destructive focus:text-destructive"
							>
								<Trash2 className="w-4 h-4" />
								<span>Delete Idea</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Main Workspace Layout (Chat is persistently hosted in the Right Chat Sidebar) */}
			<div className="w-full space-y-4">
				<Tabs defaultValue="overview" className="w-full">
					<TabsList className="w-full justify-start border-b rounded-none h-auto bg-transparent p-0 gap-2 overflow-x-auto flex-nowrap">
						<TabsTrigger
							value="overview"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5"
						>
							<BarChart3 className="w-3.5 h-3.5 text-primary" />
							Overview & Scores
						</TabsTrigger>
						<TabsTrigger
							value="filesystem"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5"
						>
							<Folder className="w-3.5 h-3.5 text-amber-500" />
							Filesystem Explorer
							{files.length > 0 && (
								<Badge
									variant="secondary"
									className="ml-1 h-4 min-w-4 px-1 text-[9px]"
								>
									{files.length}
								</Badge>
							)}
						</TabsTrigger>
						<TabsTrigger
							value="history"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5"
						>
							<MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
							Agent Timeline
						</TabsTrigger>
						<TabsTrigger
							value="deepagents"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5"
						>
							<Bot className="w-3.5 h-3.5 text-primary" />
							DeepAgents Mesh
							{interrupts.length > 0 && (
								<Badge
									variant="destructive"
									className="ml-1 h-4 min-w-4 px-1 text-[9px] animate-pulse"
								>
									{interrupts.length}
								</Badge>
							)}
						</TabsTrigger>
						<TabsTrigger
							value="research"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5"
						>
							<BookOpen className="w-3.5 h-3.5 text-blue-500" />
							Research Data
						</TabsTrigger>
					</TabsList>

					{/* ── Overview Tab ── */}
					<TabsContent value="overview" className="space-y-6 pt-4">
						{interrupts.length > 0 && (
							<InterruptInbox
								ideaId={ideaId || ""}
								interrupts={interrupts}
								onActionComplete={loadData}
							/>
						)}
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
							<div className="lg:col-span-2 space-y-5">
								{/* Problem Statement */}
								<Card>
									<CardHeader className="p-4 pb-2">
										<CardTitle className="flex items-center gap-2 text-sm">
											<Target className="w-4 h-4 text-primary" />
											Problem Statement
										</CardTitle>
									</CardHeader>
									<CardContent className="p-4 pt-1">
										<p className="text-sm text-foreground leading-relaxed">
											{idea?.problem_statement ||
												idea?.signal_text ||
												"No problem statement defined yet."}
										</p>
									</CardContent>
								</Card>

								{/* Solution Concept */}
								{idea?.solution_concept && (
									<Card>
										<CardHeader className="p-4 pb-2">
											<CardTitle className="flex items-center gap-2 text-sm">
												<Lightbulb className="w-4 h-4 text-primary" />
												Solution Concept
											</CardTitle>
										</CardHeader>
										<CardContent className="p-4 pt-1">
											<p className="text-sm text-foreground leading-relaxed">
												{idea.solution_concept}
											</p>
										</CardContent>
									</Card>
								)}

								{/* Score Radar */}
								<ScoreRadar breakdown={breakdown} size={280} />

								{/* Source Evidence */}
								{idea?.source_evidence && idea.source_evidence.length > 0 && (
									<Card>
										<CardHeader className="p-4 pb-2">
											<CardTitle className="flex items-center gap-2 text-sm">
												<FileText className="w-4 h-4 text-primary" />
												Source Evidence & References
											</CardTitle>
										</CardHeader>
										<CardContent className="p-4 pt-1">
											<ScrollArea className="max-h-48 pr-2">
												<ul className="space-y-2">
													{idea.source_evidence.map((ev: string, i: number) => (
														<li
															key={i}
															className="text-xs text-foreground flex items-start gap-2 border-b last:border-0 pb-1.5"
														>
															<FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
															{ev}
														</li>
													))}
												</ul>
											</ScrollArea>
										</CardContent>
									</Card>
								)}
							</div>

							{/* Right Column */}
							<div className="space-y-5">
								<SiemensGateStatus
									gates={(() => {
										const rawGates = gateConfig?.gates || {};
										const entries = Object.entries(rawGates);
										if (entries.length === 0) {
											return [
												{
													name: "Composite Threshold",
													status: (composite >= compositeThreshold
														? "pass"
														: currentState !== "raw_signal_collected"
															? "fail"
															: "pending") as "pass" | "fail" | "pending",
													detail: `${composite}/${compositeThreshold}`,
												},
											];
										}
										return entries.slice(0, 4).map(([key, gate]) => {
											const items = gate.items || [];
											const passed = composite >= 50;
											return {
												name: key
													.replace(/_/g, " ")
													.replace(/\b\w/g, (c) => c.toUpperCase()),
												status: (passed ? "pass" : "pending") as
													| "pass"
													| "fail"
													| "pending",
												detail: `${items.length} items`,
											};
										});
									})()}
								/>

								<Card>
									<CardHeader className="p-4 pb-2">
										<CardTitle className="text-sm font-semibold">
											Idea Metadata
										</CardTitle>
									</CardHeader>
									<CardContent className="p-4 pt-1">
										<dl className="space-y-2 text-xs">
											<div className="flex justify-between border-b pb-1">
												<dt className="text-muted-foreground">Created</dt>
												<dd className="font-mono">
													{idea?.created_at
														? new Date(idea.created_at).toLocaleDateString()
														: "—"}
												</dd>
											</div>
											<div className="flex justify-between border-b pb-1">
												<dt className="text-muted-foreground">Updated</dt>
												<dd className="font-mono">
													{idea?.updated_at
														? new Date(idea.updated_at).toLocaleDateString()
														: "—"}
												</dd>
											</div>
											<div className="flex justify-between border-b pb-1">
												<dt className="text-muted-foreground">
													Filesystem Files
												</dt>
												<dd className="font-semibold">
													{files.length} artifacts
												</dd>
											</div>
											<div className="flex justify-between">
												<dt className="text-muted-foreground">Current State</dt>
												<dd className="font-medium capitalize">
													{currentState.replace(/_/g, " ")}
												</dd>
											</div>
										</dl>
									</CardContent>
								</Card>
							</div>
						</div>
					</TabsContent>

					{/* ── Timeline Activity & Agent Conversations Tab ── */}
					<TabsContent value="history" className="pt-4">
						<IdeaHistoryTimeline
							detail={
								detail
									? { ...detail, transcript_events: transcriptEvents }
									: detail
							}
							files={files}
						/>
					</TabsContent>

					<TabsContent value="comments" className="space-y-4 pt-4">
						<Card>
							<CardHeader className="p-4 pb-2">
								<CardTitle className="text-sm font-semibold">
									Add Comment
								</CardTitle>
							</CardHeader>
							<CardContent className="p-4 pt-1 space-y-3">
								<textarea
									className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
									value={commentText}
									onChange={(e) => setCommentText(e.target.value)}
									placeholder="Write a note for this idea"
								/>
								<div className="flex justify-end">
									<Button
										onClick={handleComment}
										disabled={savingComment || !commentText.trim()}
										className="gap-2"
									>
										<SendHorizonal className="w-4 h-4" />
										Add Comment
									</Button>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* ── Filesystem Explorer Tab ── */}
					<TabsContent value="filesystem" className="pt-4">
						<IdeaFilesystem files={files} ideaId={ideaId || ""} />
					</TabsContent>

					{/* ── DeepAgents Mesh Tab ── */}
					<TabsContent value="deepagents" className="space-y-6 pt-4">
						<InterruptInbox
							ideaId={ideaId || ""}
							interrupts={interrupts}
							onActionComplete={loadData}
						/>

						{approvalTranscriptEvents.length > 0 && (
							<Card>
								<CardHeader className="p-4 pb-2">
									<CardTitle className="text-sm font-semibold flex items-center gap-2">
										<AlertTriangle className="w-4 h-4 text-amber-500" />
										Transcript Approval & Interrupt Events
									</CardTitle>
								</CardHeader>
								<CardContent className="p-4 pt-1 space-y-2">
									{approvalTranscriptEvents.map((evt: any, idx: number) => (
										<div
											key={evt.id || idx}
											className="rounded-md border p-3 bg-muted/20 text-xs space-y-1"
										>
											<div className="flex items-center justify-between gap-2">
												<div className="font-semibold text-foreground capitalize">
													{String(evt.type || "event").replace(/_/g, " ")}
												</div>
												<Badge
													variant={
														evt.type === "failed" ? "destructive" : "outline"
													}
													className="text-[10px]"
												>
													{evt.speaker || evt.agent || "Runtime"}
												</Badge>
											</div>
											<p className="text-muted-foreground">
												{evt.content ||
													evt.reason ||
													evt.details ||
													"Runtime approval event recorded."}
											</p>
											{evt.provenance && (
												<p className="text-[10px] text-muted-foreground/80 font-mono">
													{evt.provenance}
												</p>
											)}
										</div>
									))}
								</CardContent>
							</Card>
						)}

						<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
							<SubagentActivityCard subagents={subagentEvents} />
							<AgentTodoPanel />
						</div>

						<ToolCallTimeline
							events={toolCallEvents.map((evt: any) => ({
								id: evt.id || evt.timestamp || evt.type,
								tool_name: evt.tool || evt.type,
								arguments: evt.params || {},
								output:
									typeof evt.output === "string"
										? evt.output
										: evt.output
											? JSON.stringify(evt.output, null, 2)
											: undefined,
								status:
									evt.type === "tool_call"
										? "running"
										: evt.type === "tool_result"
											? "completed"
											: "failed",
								timestamp: evt.timestamp || "",
								agent: evt.agent || evt.speaker,
								speaker: evt.speaker,
								role: evt.role,
								provenance: evt.provenance,
							}))}
						/>
						<ArtifactDiffPanel
							versionA={revisions[revisions.length - 2]?.file_name}
							versionB={revisions[revisions.length - 1]?.file_name}
							contentA={revisions[revisions.length - 2]?.content}
							contentB={revisions[revisions.length - 1]?.content}
						/>
					</TabsContent>

					{/* ── Research Data Tab ── */}
					<TabsContent value="research" className="space-y-4 pt-4">
						<p className="text-xs text-muted-foreground">
							Structured AI agent findings gathered throughout the innovation
							lifecycle.
						</p>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<ResearchSection
								title="Discovery"
								icon={Search}
								data={idea?.discovery_data}
							/>
							<ResearchSection
								title="Clarification"
								icon={Lightbulb}
								data={idea?.clarification_data}
							/>
							<ResearchSection
								title="Novelty Hypothesis"
								icon={Shield}
								data={idea?.novelty_hypothesis}
							/>
							<ResearchSection
								title="Prior Art Review"
								icon={BookOpen}
								data={idea?.prior_art_review}
							/>
							<ResearchSection
								title="Detectability Review"
								icon={Search}
								data={idea?.detectability_review}
							/>
							<ResearchSection
								title="Business Value"
								icon={Zap}
								data={idea?.business_value}
							/>
							<ResearchSection
								title="Siemens Alignment"
								icon={Globe}
								data={idea?.siemens_alignment}
							/>
							<ResearchSection
								title="Ideascope Draft"
								icon={FileText}
								data={idea?.ideascope_draft}
							/>
							<ResearchSection
								title="Filing Check"
								icon={ClipboardCheck}
								data={idea?.filing_check}
							/>
							<ResearchSection
								title="Manager Review"
								icon={Users}
								data={idea?.manager_review}
							/>
							<ResearchSection
								title="IP Review"
								icon={Scale}
								data={idea?.ip_review}
							/>
							<ResearchSection
								title="IP Counsel Validation"
								icon={Shield}
								data={idea?.ip_counsel_validation}
							/>
						</div>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
