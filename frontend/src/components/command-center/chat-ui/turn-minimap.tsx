import * as React from "react";
import { cn } from "@/lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface TurnMinimapProps {
	totalTurns: number;
	activeTurnIndex?: number;
	onTurnClick: (index: number) => void;
	visible?: boolean;
	messages?: { sender: string; text: string }[];
}

export const TurnMinimap: React.FC<TurnMinimapProps> = ({
	totalTurns,
	onTurnClick,
	messages,
}) => {
	const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

	if (totalTurns <= 0) return null;

	return (
		<div
			className={cn(
				"absolute right-3.5 top-1/2 -translate-y-1/2 w-4 z-40 pointer-events-auto",
				"flex flex-col items-center justify-center gap-[4px] py-1 select-none",
			)}
			onMouseLeave={() => setHoveredIdx(null)}
		>
			<TooltipProvider delayDuration={200}>
				{Array.from({ length: totalTurns }).map((_, i) => {
					let dotClass = "w-1.5 h-1.5 bg-muted-foreground/40";

					if (hoveredIdx !== null) {
						const dist = Math.abs(hoveredIdx - i);
						if (dist === 0)
							dotClass = "w-2.5 h-2.5 bg-primary shadow-sm shadow-primary/30";
						else if (dist === 1) dotClass = "w-2 h-2 bg-primary/60";
						else if (dist === 2) dotClass = "w-1.5 h-1.5 bg-primary/30";
					}

					return (
						<Tooltip key={i}>
							<TooltipTrigger asChild>
								<button
									onClick={() => onTurnClick(i)}
									onMouseEnter={() => setHoveredIdx(i)}
									onMouseLeave={() => setHoveredIdx(null)}
									className="flex items-center justify-center w-5 h-5 cursor-pointer"
								>
									<div
										className={cn(
											"rounded-full aspect-square shrink-0 transition-all duration-150 ease-out",
											dotClass,
										)}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="left" className="text-xs max-w-[240px] p-2 bg-popover text-popover-foreground border shadow-md">
								{messages?.[i] ? (
									<div className="flex flex-col gap-0.5">
										<span className="font-semibold text-[9px] text-muted-foreground uppercase tracking-wider">
											{messages[i].sender}
										</span>
										<span className="line-clamp-2 text-xs text-foreground/90">
											{messages[i].text}
										</span>
									</div>
								) : (
									`Jump to turn ${i + 1}`
								)}
							</TooltipContent>
						</Tooltip>
					);
				})}
			</TooltipProvider>
		</div>
	);
};
TurnMinimap.displayName = "TurnMinimap";
