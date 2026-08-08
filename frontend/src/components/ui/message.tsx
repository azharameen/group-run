import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: "user" | "agent";
	avatarText?: string;
}

/**
 * Message — shadcn-compatible chat message wrapper.
 * Provides avatar + content layout for user and agent messages.
 */
const Message = React.forwardRef<HTMLDivElement, MessageProps>(
	({ className, variant = "agent", avatarText, children, ...props }, ref) => {
		const isUser = variant === "user";

		return (
			<div
				ref={ref}
				data-slot="message"
				data-variant={variant}
				className={cn(
					"flex gap-2 text-xs group relative",
					isUser ? "flex-row-reverse" : "flex-row",
					className,
				)}
				{...props}
			>
				<Avatar className="h-6 w-6 shrink-0 mt-0.5">
					<AvatarFallback
						className={cn(
							"font-bold text-[9px]",
							isUser
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground",
						)}
					>
						{avatarText || (isUser ? "YOU" : "AI")}
					</AvatarFallback>
				</Avatar>
				<div
					className={cn(
						"space-y-1 max-w-[85%]",
						isUser ? "text-right" : "text-left",
					)}
				>
					{children}
				</div>
			</div>
		);
	},
);
Message.displayName = "Message";

export { Message };
