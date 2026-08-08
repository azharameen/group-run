import * as React from "react";
import { cn } from "@/lib/utils";

interface MarkerProps extends React.HTMLAttributes<HTMLDivElement> {
	sender: string;
	timestamp?: string;
}

/**
 * Marker — shadcn-compatible chat message metadata label.
 * Displays sender name and optional timestamp above a chat bubble.
 */
const Marker = React.forwardRef<HTMLDivElement, MarkerProps>(
	({ sender, timestamp, className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				data-slot="marker"
				className={cn(
					"flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5",
					className,
				)}
				{...props}
			>
				<span className="font-semibold text-foreground">{sender}</span>
				{timestamp && (
					<span className="ml-auto text-[9px] font-mono text-muted-foreground/70">
						{timestamp}
					</span>
				)}
			</div>
		);
	},
);
Marker.displayName = "Marker";

export { Marker };
