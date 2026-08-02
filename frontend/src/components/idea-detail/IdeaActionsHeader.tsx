import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
	MoreVertical,
	Play,
	Pause,
	RefreshCw,
	Loader2,
	Send,
	Trash2,
} from "lucide-react";

interface IdeaActionsHeaderProps {
	ideaId?: string;
	title?: string;
	phase?: string;
	currentState?: string;
	pausedProcessing?: boolean;
	scoring: boolean;
	advancing: boolean;
	pausing: boolean;
	resuming: boolean;
	deleting: boolean;
	onScore: () => void;
	onAdvance: () => void;
	onPause: () => void;
	onResume: () => void;
	onDelete: () => void;
}

export function IdeaActionsHeader({
	ideaId,
	title,
	phase,
	currentState = "",
	pausedProcessing,
	scoring,
	advancing,
	pausing,
	resuming,
	deleting,
	onScore,
	onAdvance,
	onPause,
	onResume,
	onDelete,
}: IdeaActionsHeaderProps) {
	return (
		<div className="relative p-6 rounded-xl border bg-card text-card-foreground shadow-sm">
			<div className="flex flex-col gap-4">
				{/* Title on top */}
				<h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight pr-10">
					{title || ideaId}
				</h1>

				{/* Metadata details underneath */}
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5">
						<span className="font-semibold text-foreground">ID:</span>
						<span className="font-mono text-primary font-medium">{ideaId}</span>
					</div>
					<Separator orientation="vertical" className="h-3" />
					<div className="flex items-center gap-1.5">
						<span className="font-semibold text-foreground">Phase:</span>
						<Badge variant="outline" className="capitalize text-[11px] px-2 py-0">
							{phase || "discovery"}
						</Badge>
					</div>
					<Separator orientation="vertical" className="h-3" />
					<div className="flex items-center gap-1.5">
						<span className="font-semibold text-foreground">Status:</span>
						<span className="font-medium text-foreground capitalize bg-muted/60 px-2 py-0.5 rounded">
							{currentState.replace(/_/g, " ")}
						</span>
					</div>
				</div>
			</div>

			{/* Dropdown options on top right */}
			<div className="absolute top-4 right-4">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
							<MoreVertical className="h-4 w-4" />
							<span className="sr-only">More options</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem
							onClick={pausedProcessing ? onResume : onPause}
							disabled={pausing || resuming}
							className="gap-2 cursor-pointer"
						>
							{pausedProcessing ? (
								<>
									<Play className="w-4 h-4 text-emerald-500" />
									<span>Resume Processing</span>
								</>
							) : (
								<>
									<Pause className="w-4 h-4 text-amber-500" />
									<span>Pause Processing</span>
								</>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onScore}
							disabled={scoring}
							className="gap-2 cursor-pointer"
						>
							<RefreshCw className={`w-4 h-4 text-blue-500 ${scoring ? "animate-spin" : ""}`} />
							<span>Re-Score Idea</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onAdvance}
							disabled={advancing}
							className="gap-2 cursor-pointer"
						>
							{advancing ? (
								<Loader2 className="w-4 h-4 animate-spin text-primary" />
							) : (
								<Send className="w-4 h-4 text-indigo-500" />
							)}
							<span>Advance Cycle</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onDelete}
							disabled={deleting}
							className="gap-2 cursor-pointer text-destructive focus:text-destructive"
						>
							<Trash2 className="w-4 h-4" />
							<span>Delete Idea</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
