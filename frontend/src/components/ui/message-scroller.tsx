import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDown } from "lucide-react";

interface MessageScrollerProps extends React.HTMLAttributes<HTMLDivElement> {
	autoScroll?: boolean;
}

/**
 * MessageScroller — shadcn-compatible auto-scrolling chat message container.
 * Provides auto-scroll to bottom behavior with a scroll-to-bottom button.
 */
const MessageScroller = React.forwardRef<HTMLDivElement, MessageScrollerProps>(
	({ className, children, autoScroll = true, ...props }, _ref) => {
		const scrollRef = React.useRef<HTMLDivElement>(null);
		const bottomRef = React.useRef<HTMLDivElement>(null);
		const [showScrollButton, setShowScrollButton] = React.useState(false);

		const scrollToBottom = () => {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		};

		const handleScroll = () => {
			if (!scrollRef.current) return;
			const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
			const isUp = scrollHeight - scrollTop - clientHeight > 80;
			setShowScrollButton(isUp);
		};

		React.useEffect(() => {
			if (autoScroll && !showScrollButton && bottomRef.current) {
				bottomRef.current.scrollIntoView({ behavior: "smooth" });
			}
		}, [children, autoScroll, showScrollButton]);

		return (
			<div data-slot="message-scroller" className="relative flex-1 h-full overflow-hidden flex flex-col">
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className={cn("flex-1 overflow-y-auto px-4 py-4 space-y-4 font-sans", className)}
					{...props}
				>
					{children}
					<div ref={bottomRef} />
				</div>

				{showScrollButton && (
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="secondary"
									onClick={scrollToBottom}
									className="absolute bottom-3 right-3 h-8 w-8 shadow-md border rounded-full bg-background/95 backdrop-blur text-foreground hover:bg-muted z-10"
								>
									<ArrowDown className="w-4 h-4 text-primary" />
									<span className="sr-only">Scroll to latest</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left" className="text-xs">
								Scroll to latest
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>
		);
	},
);
MessageScroller.displayName = "MessageScroller";

export { MessageScroller };
