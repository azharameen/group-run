import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
	MoreVertical,
	Trash2,
} from "lucide-react";

interface IdeaActionsHeaderProps {
	ideaId?: string;
	title?: string;
	deleting: boolean;
	onDelete: () => void;
}

export function IdeaActionsHeader({
	ideaId,
	title,
	deleting,
	onDelete,
}: IdeaActionsHeaderProps) {
	return (
		<div className="relative p-6 rounded-xl border bg-card text-card-foreground shadow-sm">
			<div className="flex flex-col gap-4">
				{/* Title on top */}
				<h1 data-testid="idea-detail-title" className="text-2xl font-bold tracking-tight text-foreground leading-tight pr-10">
					{title || ideaId}
				</h1>

				{/* Metadata details underneath */}
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5">
						<span className="font-semibold text-foreground">ID:</span>
						<span className="font-mono text-primary font-medium">{ideaId}</span>
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
							onClick={onDelete}
							disabled={deleting}
							data-testid="delete-idea-action"
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
