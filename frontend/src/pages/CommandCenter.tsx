import * as React from "react";
import { useCallback } from "react";
import { createThread, type ThreadMetadata } from "@/api/client";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { useThreadManager } from "@/hooks/useThreadManager";
import { useChatStream } from "@/hooks/useChatStream";
import { CommandCenterChatPane } from "@/components/command-center/CommandCenterChatPane";
import { CommandCenterWorkspacePane } from "@/components/command-center/CommandCenterWorkspacePane";
import { useThreadContext } from "@/context/ThreadContext";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { ModelSelector } from "@/components/command-center/ModelSelector";
import type { ChatModelSelection } from "@/api/threads";

interface CommandCenterProps {
	activeThreadId?: string | null;
	setActiveThreadId?: (id: string | null) => void;
	onActiveThreadTitleChange?: (title: string) => void;
	onThreadsUpdate?: (threads: ThreadMetadata[]) => void;
	threads?: ThreadMetadata[];
	isWorkspaceOpen?: boolean;
	setIsWorkspaceOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function CommandCenter({
	activeThreadId: propsActiveThreadId,
	setActiveThreadId: propsSetActiveThreadId,
	onActiveThreadTitleChange: propsOnActiveThreadTitleChange,
	onThreadsUpdate: propsOnThreadsUpdate,
	threads: propsThreads,
	isWorkspaceOpen: propsIsWorkspaceOpen,
}: CommandCenterProps = {}) {
	let threadCtx: ReturnType<typeof useThreadContext> | null = null;
	try {
		threadCtx = useThreadContext();
	} catch {
		threadCtx = null;
	}

	let workspaceCtx: ReturnType<typeof useWorkspaceContext> | null = null;
	try {
		workspaceCtx = useWorkspaceContext();
	} catch {
		workspaceCtx = null;
	}

	const activeThreadId = propsActiveThreadId !== undefined ? propsActiveThreadId : (threadCtx?.activeThreadId ?? null);
	const setActiveThreadId = propsSetActiveThreadId ?? threadCtx?.setActiveThreadId ?? (() => {});
	const onActiveThreadTitleChange = propsOnActiveThreadTitleChange ?? (() => {});
	const onThreadsUpdate = propsOnThreadsUpdate ?? threadCtx?.setThreads ?? (() => {});
	const threads = propsThreads ?? threadCtx?.threads ?? [];
	const isWorkspaceOpen = propsIsWorkspaceOpen !== undefined ? propsIsWorkspaceOpen : (workspaceCtx?.isWorkspaceOpen ?? true);

	const [modelSelection, setModelSelection] = React.useState<ChatModelSelection | null>(null);

	const threadManager = useThreadManager({
		activeThreadId,
		setActiveThreadId,
		onActiveThreadTitleChange,
		onThreadsUpdate,
		threads,
	});

	React.useEffect(() => {
		const { provider_id, model_id } = threadManager.activeThread ?? {};
		setModelSelection(
			provider_id && model_id ? { provider_id, model_id } : null,
		);
	}, [threadManager.activeThread]);

	const ensureThread = useCallback(async (): Promise<string> => {
		if (threadManager?.ensureThread) {
			return threadManager.ensureThread();
		}
		if (activeThreadId) return activeThreadId;
		const thread = await createThread({ title: "New Chat", idea_id: null });
		onThreadsUpdate([...threads, thread]);
		setActiveThreadId(thread.thread_id);
		return thread.thread_id;
	}, [threadManager, activeThreadId, threads, onThreadsUpdate, setActiveThreadId]);

	const {
		chatInput,
		setChatInput,
		isGenerating,
		messageQueue,
		messages,
		handleStopGeneration,
		toggleTrace,
		handleSendOrQueue,
		executeSend,
		pendingInterrupt,
		isInterruptActive,
		handleApproveInterrupt,
		handleRejectInterrupt,
	} = useChatStream({
		activeThreadId,
		ensureThread,
		onThreadsUpdate,
		modelSelection,
	});

	const handleCreateNewThread = useCallback(async () => {
		try {
			const thread = await createThread({ title: "New Chat", idea_id: null });
			onThreadsUpdate([...threads, thread]);
			setActiveThreadId(thread.thread_id);
		} catch (err) {
			console.error("Error creating thread:", err);
		}
	}, [threads, onThreadsUpdate, setActiveThreadId]);

	return (
		<div className="flex flex-col flex-1 h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
			<div className="flex-1 min-h-0 overflow-hidden relative">
				{!isWorkspaceOpen ? (
					<div className="h-full w-full overflow-hidden flex flex-col bg-sidebar text-sidebar-foreground">
						<CommandCenterChatPane
							messages={messages}
							isGenerating={isGenerating}
							messageQueue={messageQueue}
							chatInput={chatInput}
							onChatInputChange={setChatInput}
							onSendOrQueue={handleSendOrQueue}
							onStopGeneration={handleStopGeneration}
							onToggleTrace={toggleTrace}
							onExecuteSend={executeSend}
							onCreateNewThread={handleCreateNewThread}
							isInterruptActive={isInterruptActive}
							pendingInterrupt={pendingInterrupt}
							onApproveInterrupt={handleApproveInterrupt}
							onRejectInterrupt={handleRejectInterrupt}
							modelSelector={<ModelSelector value={modelSelection} onChange={setModelSelection} disabled={isGenerating} />}
						/>
					</div>
				) : (
					<>
						{/* Desktop View: Side-by-side Resizable Panels */}
						<div className="hidden md:block h-full w-full overflow-hidden">
							<ResizablePanelGroup direction="horizontal" className="h-full w-full">
								<ResizablePanel
									defaultSize={35}
									minSize={25}
									maxSize={50}
									className="flex flex-col h-full bg-sidebar text-sidebar-foreground overflow-hidden"
								>
									<CommandCenterChatPane
										messages={messages}
										isGenerating={isGenerating}
										messageQueue={messageQueue}
										chatInput={chatInput}
										onChatInputChange={setChatInput}
										onSendOrQueue={handleSendOrQueue}
										onStopGeneration={handleStopGeneration}
										onToggleTrace={toggleTrace}
										onExecuteSend={executeSend}
										onCreateNewThread={handleCreateNewThread}
										isInterruptActive={isInterruptActive}
										pendingInterrupt={pendingInterrupt}
										onApproveInterrupt={handleApproveInterrupt}
										onRejectInterrupt={handleRejectInterrupt}
										modelSelector={<ModelSelector value={modelSelection} onChange={setModelSelection} disabled={isGenerating} />}
									/>
								</ResizablePanel>

								<ResizableHandle withHandle />

								<ResizablePanel
									defaultSize={65}
									className="flex flex-col h-full overflow-hidden bg-background"
								>
									<CommandCenterWorkspacePane />
								</ResizablePanel>
							</ResizablePanelGroup>
						</div>

						{/* Mobile View: Workspace View */}
						<div className="block md:hidden h-full w-full overflow-hidden">
							<CommandCenterWorkspacePane />
						</div>
					</>
				)}
			</div>
		</div>
	);
}
