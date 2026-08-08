import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Copy,
	Check,
	Pencil,
	RotateCw,
	ThumbsUp,
	ThumbsDown,
	Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TooltipButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
	tooltip: string;
}

export const TooltipButton = React.forwardRef<HTMLButtonElement, TooltipButtonProps>(
	({ tooltip, children, ...props }, ref) => {
		return (
			<TooltipProvider delayDuration={200}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button ref={ref} {...props}>
							{children}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" align="center" className="text-xs">
						{tooltip}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	},
);
TooltipButton.displayName = "TooltipButton";

interface MessageActionsProps {
	text: string;
	variant?: "user" | "agent";
	hasTrace?: boolean;
	onEdit?: (text: string) => void;
	onRegenerate?: () => void;
	onToggleTrace?: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
	text,
	variant = "agent",
	hasTrace = false,
	onEdit,
	onRegenerate,
	onToggleTrace,
}) => {
	const [copied, setCopied] = React.useState(false);
	const [liked, setLiked] = React.useState<boolean | null>(null);
	const isUser = variant === "user";

	const handleCopy = () => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			className={cn(
				"flex items-center gap-1 mt-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity",
				isUser ? "justify-end" : "justify-start",
			)}
		>
			<TooltipButton
				variant="ghost"
				size="icon"
				onClick={handleCopy}
				tooltip="Copy message"
				className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted"
			>
				{copied ? (
					<Check className="w-3 h-3 text-emerald-500" />
				) : (
					<Copy className="w-3 h-3" />
				)}
			</TooltipButton>

			{isUser && onEdit && (
				<TooltipButton
					variant="ghost"
					size="icon"
					onClick={() => onEdit(text)}
					tooltip="Edit message"
					className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted"
				>
					<Pencil className="w-3 h-3" />
				</TooltipButton>
			)}

			{!isUser && (
				<>
					{onRegenerate && (
						<TooltipButton
							variant="ghost"
							size="icon"
							onClick={onRegenerate}
							tooltip="Regenerate reply"
							className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted"
						>
							<RotateCw className="w-3 h-3" />
						</TooltipButton>
					)}

					<TooltipButton
						variant="ghost"
						size="icon"
						onClick={() => setLiked(liked === true ? null : true)}
						tooltip="Good response"
						className={cn(
							"h-5 w-5 hover:bg-muted",
							liked === true ? "text-emerald-500" : "text-muted-foreground",
						)}
					>
						<ThumbsUp className="w-3 h-3" />
					</TooltipButton>

					<TooltipButton
						variant="ghost"
						size="icon"
						onClick={() => setLiked(liked === false ? null : false)}
						tooltip="Poor response"
						className={cn(
							"h-5 w-5 hover:bg-muted",
							liked === false ? "text-rose-500" : "text-muted-foreground",
						)}
					>
						<ThumbsDown className="w-3 h-3" />
					</TooltipButton>

					{hasTrace && onToggleTrace && (
						<TooltipButton
							variant="ghost"
							size="icon"
							onClick={onToggleTrace}
							tooltip="View Execution Trace"
							className="h-5 w-5 text-muted-foreground hover:text-primary hover:bg-muted"
						>
							<Wrench className="w-3 h-3" />
						</TooltipButton>
					)}
				</>
			)}
		</div>
	);
};
MessageActions.displayName = "MessageActions";
