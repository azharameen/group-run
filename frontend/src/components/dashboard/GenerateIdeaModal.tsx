import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import type { Topic, Project } from "@/api/client";

const IDEA_CATEGORIES = [
	{ value: "Product Enhancement / Feature", label: "Product Enhancement / Feature" },
	{ value: "New Product Idea", label: "New Product Idea" },
	{ value: "Existing Project", label: "Existing Project" },
	{ value: "Others", label: "Others" },
];

interface GenerateIdeaModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	topics: Topic[];
	projects: Project[];
	selectedTopic: string;
	onSelectTopic: (val: string) => void;
	selectedCategory: string;
	onSelectCategory: (val: string) => void;
	selectedProject: string;
	onSelectProject: (val: string) => void;
	promptText: string;
	onPromptTextChange: (val: string) => void;
	generating: boolean;
	onGenerate: () => void;
}

export function GenerateIdeaModal({
	open,
	onOpenChange,
	topics,
	projects,
	selectedTopic,
	onSelectTopic,
	selectedCategory,
	onSelectCategory,
	selectedProject,
	onSelectProject,
	promptText,
	onPromptTextChange,
	generating,
	onGenerate,
}: GenerateIdeaModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Generate New Idea</DialogTitle>
					<DialogDescription>
						Select a topic, category, and optionally describe what you want. The agent will generate ideas through the full pipeline.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<label className="text-xs font-medium text-muted-foreground">Technology Topic</label>
						<Select value={selectedTopic} onValueChange={onSelectTopic}>
							<SelectTrigger>
								<SelectValue placeholder="Any" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">Any</SelectItem>
								{topics.map((t) => (
									<SelectItem key={t.TopicId} value={String(t.TopicId)}>
										{t.TopicName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<label className="text-xs font-medium text-muted-foreground">Idea Category</label>
						<Select value={selectedCategory} onValueChange={onSelectCategory}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{IDEA_CATEGORIES.map((c) => (
									<SelectItem key={c.value} value={c.value}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedCategory === "Existing Project" && (
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">Select Project</label>
							<Select value={selectedProject} onValueChange={onSelectProject}>
								<SelectTrigger>
									<SelectValue placeholder="Choose a project..." />
								</SelectTrigger>
								<SelectContent className="max-h-64">
									{projects
										.filter((p) => p.ProjectName.trim())
										.map((p) => (
											<SelectItem key={p.ProjectID} value={String(p.ProjectID)}>
												{p.ProjectName}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="space-y-1.5">
						<label className="text-xs font-medium text-muted-foreground">Your Prompt (optional)</label>
						<Textarea
							value={promptText}
							onChange={(e) => onPromptTextChange(e.target.value)}
							placeholder="Describe what kind of idea you're looking for... Leave empty for autonomous generation based on the topic above."
							className="h-24 resize-none"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onGenerate} disabled={generating} className="gap-2">
						{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
						{generating ? "Generating..." : "Generate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
