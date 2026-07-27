import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { JsonViewer } from "@/components/JsonViewer";
import {
	MessageSquare,
	TrendingUp,
	GitCommit,
	ShieldCheck,
	Bot,
	User,
	ChevronDown,
	ChevronRight,
	Filter,
} from "lucide-react";

export interface TimelineItem {
	id: string;
	type: "discussion" | "transition" | "score" | "gate";
	timestamp: string;
	title: string;
	agentName?: string;
	agentRole?: string;
	question?: string;
	answer?: string;
	fromState?: string;
	toState?: string;
	scoreBefore?: number;
	scoreAfter?: number;
	explanation?: string;
	handoverContent?: string;
	criteriaDetail?: Record<string, any>;
	gateName?: string;
	gatePassed?: boolean;
}

interface Props {
	detail: any;
	files?: any[];
}

export function IdeaHistoryTimeline({ detail, files = [] }: Props) {
	const [filterType, setFilterType] = useState<
		"all" | "discussion" | "transition" | "score" | "gate"
	>("all");
	const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

	// Construct timeline items from state history, score history, and handover files
	const idea = detail?.idea || {};
	const stateData = detail?.state || {};
	const scoresData = detail?.scores || {};
	const stateHistory: any[] = stateData?.history || [];
	const scoreHistory: any[] = scoresData?.history || [];

	// Extract handover files
	const handoverFiles = files.filter((f) => f.path.startsWith("handovers/"));

	const items: TimelineItem[] = [];

	// Add state transitions & handovers
	stateHistory.forEach((h, idx) => {
		const toState = h.to || h.state || h.to_state || "";
		const fromState =
			h.from ||
			h.from_state ||
			(idx > 0
				? stateHistory[idx - 1].to || stateHistory[idx - 1].state
				: "raw_signal_collected");
		const handover = handoverFiles.find(
			(f) => f.filename.includes(fromState) || f.filename.includes(toState),
		);
		items.push({
			id: `trans-${idx}`,
			type: "transition",
			timestamp: h.timestamp || idea.created_at || new Date().toISOString(),
			title: `Workflow Transitioned to ${toState?.replace(/_/g, " ")}`,
			agentName:
				h.agent_responsible ||
				h.agent ||
				idea.running_agent ||
				"Workflow Orchestrator",
			fromState: fromState,
			toState: toState,
			explanation:
				h.reason ||
				`Advanced from ${fromState?.replace(/_/g, " ")} to ${toState?.replace(/_/g, " ")}`,
			handoverContent: handover?.content,
		});
	});

	// ── Agent Agent Map: which idea.yaml field maps to which agent ──
	const agentDiscussions = [
		{
			field: "discovery_data",
			id: "disc-discovery",
			title: "Idea Discoverer — Signal Analysis",
			agentName: "idea-discoverer",
			agentRole: "Idea Discovery Agent",
			question:
				"What core technical innovation and problem signal is present in the ingested repository data?",
			explanation:
				"Extracted initial problem hypothesis, innovation aspects, and target technological domain.",
		},
		{
			field: "clarification_data",
			id: "disc-clarification",
			title: "Problem Framer — Formal Problem Statement",
			agentName: "problem-framer",
			agentRole: "Problem Clarification Agent",
			question:
				"What is the precise technical problem and solution architecture?",
			explanation:
				"Refined problem statement with technical context, solution direction, and claim concepts.",
		},
		{
			field: "novelty_hypothesis",
			id: "disc-novelty",
			title: "Novelty Analyst — Novelty Hypothesis",
			agentName: "novelty-analyst",
			agentRole: "Novelty & Non-Obviousness Agent",
			question:
				"What makes this idea novel and non-obvious vs. existing solutions?",
			explanation:
				"Articulated novelty claims, differentiating features, search terms, and IPC/CPC classes.",
		},
		{
			field: "prior_art_review",
			id: "disc-priorart",
			title: "Prior Art Researcher — Prior Art Analysis",
			agentName: "prior-art-researcher",
			agentRole: "Prior Art & Novelty Analyst",
			question:
				"Are there any overlapping prior art patents in existing databases?",
			explanation:
				"Evaluated novelty distance against existing global patent literature.",
		},
		{
			field: "detectability_review",
			id: "disc-detectability",
			title: "Detectability Analyst — Infringement Detection",
			agentName: "detectability-analyst",
			agentRole: "Detectability & Enforcement Agent",
			question: "Can infringement of this patent be detected in practice?",
			explanation:
				"Evaluated detection methods, reverse engineering difficulty, and non-obviousness arguments.",
		},
		{
			field: "business_value",
			id: "disc-business",
			title: "Business Value Analyst — Market Assessment",
			agentName: "business-value-analyst",
			agentRole: "Business Value & Market Agent",
			question: "What is the business value and market impact for Siemens?",
			explanation:
				"Assessed market impact, Siemens business units, competitive advantage, and licensing potential.",
		},
		{
			field: "siemens_alignment",
			id: "disc-alignment",
			title: "Siemens Alignment Validator — Strategic Check",
			agentName: "siemens-alignment",
			agentRole: "Siemens Portfolio & BU Evaluator",
			question:
				"Which Siemens Business Unit benefits from this patent and does it align with strategy?",
			explanation:
				"Verified Siemens strategic tech domain alignment, portfolio synergy, and TRL estimate.",
		},
		{
			field: "ideascope_draft",
			id: "disc-ideascope",
			title: "Patent Drafter — IdeaScope Document",
			agentName: "patent-drafter",
			agentRole: "Patent Document Drafter",
			question:
				"Can you draft a complete IdeaScope invention disclosure for this idea?",
			explanation:
				"Drafted structured IdeaScope document with claims, detailed description, and abstract.",
		},
		{
			field: "filing_check",
			id: "disc-filing",
			title: "Checklist Validator — Filing Compliance",
			agentName: "checklist-validator",
			agentRole: "Compliance & Checklist Agent",
			question:
				"Does this idea pass all Siemens internal filing compliance checks?",
			explanation:
				"Ran 7-item filing compliance checklist including prior art, inventors, and confidentiality.",
		},
		{
			field: "manager_review",
			id: "disc-manager",
			title: "Reviewer Summarizer — Manager Review",
			agentName: "reviewer-summarizer",
			agentRole: "Manager Review Agent",
			question:
				"Should management approve this patent idea for further processing?",
			explanation:
				"Simulated manager review with sign-off decision, comments, and resource commitment.",
		},
		{
			field: "ip_review",
			id: "disc-ip",
			title: "Reviewer Summarizer — IP Attorney Review",
			agentName: "reviewer-summarizer",
			agentRole: "IP Attorney Review Agent",
			question:
				"Is this idea patentable and what is the recommended filing strategy?",
			explanation:
				"Simulated IP attorney review with patentability opinion and jurisdiction recommendations.",
		},
		{
			field: "ip_counsel_validation",
			id: "disc-counsel",
			title: "Checklist Validator — IP Counsel Final Validation",
			agentName: "checklist-validator",
			agentRole: "IP Counsel Validation Agent",
			question: "Does IP counsel give final approval for filing?",
			explanation:
				"Final Siemens IP counsel validation with filing strategy and next steps.",
		},
		{
			field: "submission_packet",
			id: "disc-submission",
			title: "Reviewer Summarizer — Submission Packet Ready",
			agentName: "reviewer-summarizer",
			agentRole: "Submission Readiness Agent",
			question: "Is this idea ready for formal patent submission?",
			explanation:
				"Generated final submission-ready summary packet with highlights and risk factors.",
		},
	];

	for (const disc of agentDiscussions) {
		if (idea[disc.field]) {
			items.push({
				id: disc.id,
				type: "discussion",
				timestamp:
					idea.updated_at || idea.created_at || new Date().toISOString(),
				title: disc.title,
				agentName: disc.agentName,
				agentRole: disc.agentRole,
				question: disc.question,
				answer:
					typeof idea[disc.field] === "string"
						? idea[disc.field]
						: JSON.stringify(idea[disc.field], null, 2),
				explanation: disc.explanation,
			});
		}
	}

	// Add score evaluations
	scoreHistory.forEach((s, idx) => {
		items.push({
			id: `score-${idx}`,
			type: "score",
			timestamp: s.timestamp || new Date().toISOString(),
			title: `Composite Score Evaluated: ${s.composite}/100 (${s.strength_rating || "Scored"})`,
			agentName: s.agent_responsible || s.agent || "Evaluator Agent",
			scoreAfter: s.composite,
			explanation:
				s.change_explanation ||
				s.summary ||
				"Scoring engine evaluated 7 criteria.",
			criteriaDetail: s.criteria_detail,
		});
	});

	// Add Siemens gate check events
	const composite = scoresData?.latest?.composite || 0;
	items.push({
		id: "gate-siemens",
		type: "gate",
		timestamp: idea.updated_at || new Date().toISOString(),
		title: "Siemens Gate Compliance Check: Minimum Composite ≥ 70",
		gateName: "Siemens Internal Filing Gate",
		gatePassed: composite >= 70,
		explanation:
			composite >= 70
				? `Gate PASSED with composite score of ${composite}/100. Qualified for drafting and IP counsel validation.`
				: `Gate PENDING. Current composite score is ${composite}/100 (Threshold requires ≥ 70).`,
	});

	// Sort timeline items chronologically (newest first)
	items.sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);

	const filteredItems = items.filter((item) => {
		if (filterType === "all") return true;
		return item.type === filterType;
	});

	const toggleExpand = (id: string) => {
		setExpandedItems((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<Card className="w-full">
			<CardHeader className="p-4 pb-3">
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
					<div>
						<CardTitle className="text-base font-semibold flex items-center gap-2">
							<MessageSquare className="w-4 h-4 text-primary" />
							Activity Timeline & Agent Discussions
						</CardTitle>
						<p className="text-xs text-muted-foreground mt-0.5">
							Chronological log of agent conversations, questions & answers,
							score updates, and state transitions
						</p>
					</div>

					{/* Filter Chips */}
					<div className="flex items-center gap-1.5 flex-wrap">
						<Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
						<Badge
							variant={filterType === "all" ? "default" : "outline"}
							className="cursor-pointer text-[11px]"
							onClick={() => setFilterType("all")}
						>
							All ({items.length})
						</Badge>
						<Badge
							variant={filterType === "discussion" ? "default" : "outline"}
							className="cursor-pointer text-[11px]"
							onClick={() => setFilterType("discussion")}
						>
							Agent Q&A ({items.filter((i) => i.type === "discussion").length})
						</Badge>
						<Badge
							variant={filterType === "transition" ? "default" : "outline"}
							className="cursor-pointer text-[11px]"
							onClick={() => setFilterType("transition")}
						>
							Transitions ({items.filter((i) => i.type === "transition").length}
							)
						</Badge>
						<Badge
							variant={filterType === "score" ? "default" : "outline"}
							className="cursor-pointer text-[11px]"
							onClick={() => setFilterType("score")}
						>
							Scoring ({items.filter((i) => i.type === "score").length})
						</Badge>
						<Badge
							variant={filterType === "gate" ? "default" : "outline"}
							className="cursor-pointer text-[11px]"
							onClick={() => setFilterType("gate")}
						>
							Gates ({items.filter((i) => i.type === "gate").length})
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-4 pt-1 space-y-4">
				{filteredItems.length === 0 ? (
					<p className="text-xs text-muted-foreground text-center py-8">
						No activity logs found for this filter category.
					</p>
				) : (
					<div className="relative border-l-2 border-border ml-3 pl-4 space-y-6">
						{filteredItems.map((item) => {
							const isExpanded = expandedItems.has(item.id);

							return (
								<div key={item.id} className="relative group">
									{/* Icon Indicator */}
									<div className="absolute -left-[27px] top-0 flex aspect-square size-6 items-center justify-center rounded-full bg-background border border-border shadow-2xs">
										{item.type === "discussion" && (
											<Bot className="w-3.5 h-3.5 text-primary" />
										)}
										{item.type === "transition" && (
											<GitCommit className="w-3.5 h-3.5 text-blue-500" />
										)}
										{item.type === "score" && (
											<TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
										)}
										{item.type === "gate" && (
											<ShieldCheck
												className={`w-3.5 h-3.5 ${item.gatePassed ? "text-emerald-500" : "text-amber-500"}`}
											/>
										)}
									</div>

									<div className="space-y-2">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div className="flex items-center gap-2">
												<span className="text-xs font-semibold text-foreground">
													{item.title}
												</span>
												{item.agentName && (
													<Badge
														variant="secondary"
														className="text-[10px] h-5 gap-1 font-normal"
													>
														<User className="w-3 h-3 text-muted-foreground" />
														{item.agentName}
													</Badge>
												)}
											</div>
											<span className="text-[10px] font-mono text-muted-foreground">
												{new Date(item.timestamp).toLocaleString()}
											</span>
										</div>

										{/* Short Explanation */}
										{item.explanation && (
											<p className="text-xs text-muted-foreground leading-relaxed">
												{item.explanation}
											</p>
										)}

										{/* Agent Question & Answer Box */}
										{item.type === "discussion" &&
											(item.question || item.answer) && (
												<div className="space-y-2 mt-2 bg-muted/30 p-3 rounded-lg border text-xs">
													{item.question && (
														<div className="space-y-1">
															<span className="font-semibold text-primary flex items-center gap-1">
																❓ Agent Question / Objective:
															</span>
															<p className="text-foreground bg-background p-2 rounded border">
																{item.question}
															</p>
														</div>
													)}
													{item.answer && (
														<div className="space-y-1 pt-1">
															<span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
																💡 Agent Finding & Decision:
															</span>
															<div className="text-xs font-mono bg-background p-2.5 rounded border overflow-x-auto">
																<JsonViewer data={item.answer} />
															</div>
														</div>
													)}
												</div>
											)}

										{/* Handover Packet or Criteria Detail Expandable */}
										{(item.handoverContent || item.criteriaDetail) && (
											<div>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => toggleExpand(item.id)}
													className="h-7 text-[11px] gap-1 p-0 hover:bg-transparent text-primary"
												>
													{isExpanded ? (
														<ChevronDown className="w-3.5 h-3.5" />
													) : (
														<ChevronRight className="w-3.5 h-3.5" />
													)}
													{item.handoverContent
														? "View Handover Packet"
														: "View Criteria Breakdown Details"}
												</Button>

												{isExpanded && (
													<div className="mt-2">
														{item.handoverContent && (
															<MarkdownViewer
																content={item.handoverContent}
																filename="handover.md"
																defaultMode="preview"
															/>
														)}

														{item.criteriaDetail && (
															<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
																{Object.entries(item.criteriaDetail).map(
																	([key, detail]: [string, any]) => (
																		<div
																			key={key}
																			className="text-xs border rounded p-2 bg-card space-y-1"
																		>
																			<div className="flex justify-between font-medium">
																				<span className="capitalize">
																					{key.replace(/_/g, " ")}
																				</span>
																				<span>{detail.score}/100</span>
																			</div>
																			{detail.reasoning && (
																				<p className="text-[11px] text-muted-foreground">
																					{detail.reasoning}
																				</p>
																			)}
																		</div>
																	),
																)}
															</div>
														)}
													</div>
												)}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
