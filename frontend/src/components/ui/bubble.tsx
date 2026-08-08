import * as React from "react";
import { cn } from "@/lib/utils";

interface BubbleProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: "user" | "agent";
	isStreaming?: boolean;
}

/**
 * Bubble — shadcn-compatible chat message bubble component.
 * Wraps a chat message with appropriate styling for user/agent variants.
 */
const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(
	({ className, variant = "agent", isStreaming = false, children, ...props }, ref) => {
		const isUser = variant === "user";

		return (
			<div
				ref={ref}
				data-slot="bubble"
				data-variant={variant}
				className={cn(
					"p-2.5 rounded-lg text-xs leading-relaxed transition-all",
					isUser
						? "bg-primary text-primary-foreground rounded-tr-none"
						: "bg-muted border text-foreground rounded-tl-none",
					className,
				)}
				{...props}
			>
				{children}
				{isStreaming && (
					<span className="inline-block w-1.5 h-3 ml-1 bg-primary animate-ping" />
				)}
			</div>
		);
	},
);
Bubble.displayName = "Bubble";

export { Bubble };
