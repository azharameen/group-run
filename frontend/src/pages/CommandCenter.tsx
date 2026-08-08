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

interface CommandCenterProps {
	activeThreadId: string | null;
	setActiveThreadId: (id: string | null) => void;
	onActiveThreadTitleChange: (title: string) => void;
	onThreadsUpdate: (threads: ThreadMetadata[]) => void;
	threads: ThreadMetadata[];
	isWorkspaceOpen?: boolean;
	setIsWorkspaceOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function CommandCenter({
	activeThreadId,
	setActiveThreadId,
	onActiveThreadTitleChange,
	onThreadsUpdate,
	threads,
	isWorkspaceOpen = true,
}: CommandCenterProps) {

	useThreadManager({
		activeThreadId,
		setActiveThreadId,
		onActiveThreadTitleChange,
		onThreadsUpdate,
		threads,
	});

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
	} = useChatStream({
		activeThreadId,
		ensureThread: async () => {
			if (activeThreadId) return activeThreadId;
			const thread = await createThread({ title: "New Chat", idea_id: null });
			onThreadsUpdate([...threads, thread]);
			setActiveThreadId(thread.thread_id);
			return thread.thread_id;
		},
		onThreadsUpdate,
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
