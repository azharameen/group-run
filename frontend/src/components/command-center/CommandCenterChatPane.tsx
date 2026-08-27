import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// shadcn-compatible chat UI primitives
import { MessageScroller } from "@/components/ui/message-scroller";
import { Message } from "@/components/ui/message";
import { Bubble } from "@/components/ui/bubble";
import { Marker } from "@/components/ui/marker";
// Feature-specific chat components (app-level, not generic UI)
import { LiveTrace } from "./chat-ui/live-trace";
import { TurnMinimap } from "./chat-ui/turn-minimap";
import { MessageActions } from "./chat-ui/message-actions";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@/components/ui/collapsible";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { BotMessageSquare, Send, Plus, Square } from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import type { InterruptPayload } from "@/api/threads";
import { EVENT_LABELS, messageBadgeVariant } from "@/lib/chat-utils";
import { HITLApprovalCard } from "@/components/deepagents/HITLApprovalCard";

interface CommandCenterChatPaneProps {
	messages: ChatMessage[];
	isGenerating: boolean;
	messageQueue: string[];
	chatInput: string;
	onChatInputChange: (val: string) => void;
	onSendOrQueue: () => void;
	onStopGeneration: () => void;
	onToggleTrace: (id: string) => void;
	onExecuteSend: (text: string) => void;
	onCreateNewThread: () => void;
	// Interrupt overlay props
	isInterruptActive?: boolean;
	pendingInterrupt?: InterruptPayload | null;
	onApproveInterrupt?: (id: string, decision: string, reason: string) => Promise<void>;
	onRejectInterrupt?: (id: string, reason: string) => Promise<void>;
}

export function CommandCenterChatPane({
	messages,
	isGenerating,
	messageQueue,
	chatInput,
	onChatInputChange,
	onSendOrQueue,
	onStopGeneration,
	onToggleTrace,
	onExecuteSend,
	onCreateNewThread,
	isInterruptActive = false,
	pendingInterrupt,
	onApproveInterrupt,
	onRejectInterrupt,
}: CommandCenterChatPaneProps) {
	const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});

	const scrollToTurnIndex = (idx: number) => {
		const el = messageRefs.current[idx];
		if (el) {
			const container = el.closest<HTMLDivElement>("[data-slot='message-scroller'] > div");
			if (container) {
				const containerTop = container.getBoundingClientRect().top;
				const elTop = el.getBoundingClientRect().top;
				const targetScroll = container.scrollTop + (elTop - containerTop) - container.clientHeight / 2 + el.clientHeight / 2;
				if (typeof container.scrollTo === "function") {
					container.scrollTo({ top: targetScroll, behavior: "smooth" });
				} else {
					container.scrollTop = targetScroll;
				}
			} else if (typeof el.scrollIntoView === "function") {
				el.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
		}
	};

	return (
		<div className="relative flex flex-col h-full bg-sidebar text-sidebar-foreground overflow-hidden">
			{/* Floating turn minimap strip */}
			<TurnMinimap
				totalTurns={messages.length}
				onTurnClick={scrollToTurnIndex}
				messages={messages}
			/>

			{/* Chat messages viewport */}
			<div data-testid="message-list" className="flex-1 overflow-hidden flex flex-col h-full bg-background/50 relative">
				{messages.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground space-y-4">
						<BotMessageSquare className="w-12 h-12 text-primary opacity-50" />
						<div className="space-y-1">
							<p className="text-sm font-semibold">Start a conversation</p>
							<p className="text-xs text-muted-foreground">
								Ask the Agent Companion team to assist with researching,
								designing, or advancing files.
							</p>
						</div>
					</div>
				) : (
					<MessageScroller>
						{messages.map((msg, idx) => {
							const isUser =
								msg.eventType === "user_message" ||
								msg.sender === "You" ||
								msg.sender === "Inventor" ||
								msg.sender === "user";
							const label = EVENT_LABELS[msg.eventType || ""] || "Message";
							const hasTrace = Boolean(msg.liveTrace?.length);

							return (
								<div
									key={msg.id}
									data-testid={`message-${idx}`}
									ref={(el) => {
										messageRefs.current[idx] = el;
									}}
								>
									<Message
										variant={isUser ? "user" : "agent"}
										avatarText={
											isUser
												? "YOU"
												: msg.eventType === "message"
													? msg.sender?.substring(0, 2).toUpperCase() || "AI"
													: "AI"
										}
									>
										<Marker sender={msg.sender} timestamp={msg.timestamp} />
										{msg.eventType === "message" ? (
											<div className="flex items-center gap-1.5 mb-0.5">
												<span className="text-xs font-semibold text-primary truncate">
													{msg.sender || "Agent"}
												</span>
												<span className="text-[10px] font-mono text-muted-foreground/60">
													{msg.timestamp}
												</span>
											</div>
										) : isUser || msg.eventType === "user_message" ? null : (
											<div className="flex items-center gap-2">
												<Badge
													variant={messageBadgeVariant(msg.eventType)}
													className="text-[10px] uppercase font-mono"
												>
													{label}
												</Badge>
												{msg.provenance && (
													<span className="text-[10px] font-mono text-muted-foreground truncate">
														{msg.provenance}
													</span>
												)}
											</div>
										)}

										{hasTrace && msg.isTraceOpen && (
											<LiveTrace
												steps={msg.liveTrace || []}
												isStreaming={msg.isStreaming}
											/>
										)}

										<Bubble
											variant={isUser ? "user" : "agent"}
											isStreaming={msg.isStreaming}
										>
											{msg.text || (msg.isStreaming ? "" : "...")}
										</Bubble>

										{msg.eventType === "tool_call" && msg.params && (
											<Collapsible>
												<CollapsibleTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														className="h-7 px-2 text-[11px]"
													>
														Tool arguments
													</Button>
												</CollapsibleTrigger>
												<CollapsibleContent className="rounded-md border bg-muted/20 p-2 text-[11px] font-mono">
													<pre className="whitespace-pre-wrap overflow-x-auto text-foreground">
														{JSON.stringify(msg.params, null, 2)}
													</pre>
												</CollapsibleContent>
											</Collapsible>
										)}

										{(msg.output ||
											msg.from_agent ||
											msg.to_agent ||
											msg.decision ||
											msg.reason) && (
											<div className="text-[11px] text-muted-foreground space-y-1">
												{msg.from_agent && msg.to_agent && (
													<div>
														{msg.from_agent} → {msg.to_agent}
													</div>
												)}
												{msg.decision && <div>Decision: {msg.decision}</div>}
												{msg.reason && <div>{msg.reason}</div>}
												{msg.output !== undefined && (
													<Collapsible>
														<CollapsibleTrigger asChild>
															<Button
																variant="ghost"
																size="sm"
																className="h-7 px-2 text-[11px]"
															>
																Result
															</Button>
														</CollapsibleTrigger>
														<CollapsibleContent className="rounded border bg-muted/20 p-2">
															<pre className="font-mono text-foreground whitespace-pre-wrap overflow-x-auto text-[11px]">
																{typeof msg.output === "string"
																	? msg.output
																	: JSON.stringify(msg.output, null, 2)}
															</pre>
														</CollapsibleContent>
													</Collapsible>
												)}
											</div>
										)}

										<MessageActions
											text={msg.text}
											variant={isUser ? "user" : "agent"}
											hasTrace={hasTrace}
											onRegenerate={
												!isUser ? () => onExecuteSend(msg.text) : undefined
											}
											onToggleTrace={
												hasTrace ? () => onToggleTrace(msg.id) : undefined
											}
										/>
									</Message>
								</div>
							);
						})}
					</MessageScroller>
				)}
			</div>

			{/* HITL Approval Overlay — appears above input when interrupt is active */}
			{isInterruptActive && pendingInterrupt && (
				<div data-testid="interrupt-overlay" className="px-3 pb-2 shrink-0">
					<HITLApprovalCard
						interrupts={[pendingInterrupt]}
						onApproved={(id) =>
							onApproveInterrupt?.(id, "approved", "Approved during chat")
						}
						onRejected={(id) =>
							onRejectInterrupt?.(id, "Interrupt rejected during chat")
						}
					/>
				</div>
			)}

			{/* Chat Input Footer */}
			<div className="border-t p-3 shrink-0">
				<div className="space-y-2">
					{messageQueue.length > 0 && (
						<div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
							<span>
								{messageQueue.length} message
								{messageQueue.length > 1 ? "s" : ""} queued
							</span>
							<Badge variant="secondary" className="text-[9px] px-1 py-0">
								Sequencing
							</Badge>
						</div>
					)}

					<div className="rounded-lg bg-secondary p-2">
						<Textarea
							data-testid="chat-input"
							disabled={isInterruptActive}
							placeholder={
								isInterruptActive
									? "Awaiting your approval..."
									: isGenerating
										? "Type to queue message..."
										: "Ask the team to bring your idea to life"
							}
							value={chatInput}
							onChange={(e) => onChatInputChange(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									onSendOrQueue();
								}
							}}
							className="w-full border-none focus:border-none focus-visible:border-none shadow-none outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-xs min-h-[42px] max-h-[80px] resize-none p-0 placeholder:text-muted-foreground text-foreground bg-transparent"
						/>
						<div className="flex items-center justify-between pt-1">
							<div className="flex items-center gap-1 text-muted-foreground">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											data-testid="new-thread-button"
											variant="ghost"
											size="icon"
											className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
											onClick={onCreateNewThread}
										>
											<Plus className="w-3.5 h-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs">
										New thread
									</TooltipContent>
								</Tooltip>
							</div>

							{isGenerating ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											data-testid="stop-button"
											size="icon"
											variant="destructive"
											onClick={onStopGeneration}
											className="h-6 w-6 rounded-md"
										>
											<Square className="w-3 h-3 fill-current" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs">
										Stop generation
									</TooltipContent>
								</Tooltip>
							) : chatInput.trim() ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											data-testid="send-button"
											size="icon"
											onClick={onSendOrQueue}
											className="h-6 w-6 rounded-md bg-primary text-primary-foreground"
										>
											<Send className="w-3.5 h-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs">
										Send message
									</TooltipContent>
								</Tooltip>
							) : (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											data-testid="send-button"
											size="icon"
											disabled
											className="h-6 w-6 rounded-md bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
										>
											<Send className="w-3.5 h-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs">
										Enter a message to send
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
