import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { FileText, Target, AlertTriangle, Lightbulb, Loader2, SendHorizonal } from "lucide-react";
import { fetchIdeaDetail, fetchIdeaFiles, deleteIdea, addIdeaComment, connectSSE, type IdeaDetail as IdeaDetailType, type IdeaFile } from "../api/client";
import { fetchPendingInterrupts } from "../api/deepagents";
import { InterruptItem } from "../types/deepagents";
import { IdeaFilesystem } from "../components/IdeaFilesystem";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { IdeaActionsHeader } from "../components/idea-detail/IdeaActionsHeader";

export default function IdeaDetail({ onIdeaLoaded }: { onIdeaLoaded?: (title: string) => void; }) {
	const { ideaId } = useParams<{ ideaId: string }>();
	const [detail, setDetail] = useState<IdeaDetailType | null>(null);
	const [files, setFiles] = useState<IdeaFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [deleting, setDeleting] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [savingComment, setSavingComment] = useState(false);
	const [error, setError] = useState("");
	const [interrupts, setInterrupts] = useState<InterruptItem[]>([]);
	const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
	const { toast } = useToast();

	const loadData = async () => {
		if (!ideaId) return;
		try {
			const [detailRes, filesRes, interruptsRes] = await Promise.all([
				fetchIdeaDetail(ideaId),
				fetchIdeaFiles(ideaId).catch(() => []),
				fetchPendingInterrupts(ideaId).catch(() => []),
			]);
			setDetail(detailRes);
			setFiles(filesRes);
			setInterrupts(interruptsRes);
			if (detailRes?.idea?.title && onIdeaLoaded) onIdeaLoaded(detailRes.idea.title);
		} catch (err: any) {
			setError(err.message);
		}
		setLoading(false);
	};

	useEffect(() => {
		loadData();
		if (!ideaId) return;

		const es = connectSSE(() => {
			loadData();
		});
		return () => es.close();
	}, [ideaId]);

	const handleDelete = async () => {
		if (!ideaId) return;
		setDeleting(true);
		try {
			const result = await deleteIdea(ideaId);
			if (result.deleted) return void (window.location.href = "/");
			await loadData();
			toast({
				title: "Delete Request Submitted",
				description: result.message || "Delete request submitted for approval.",
			});
		} catch (err: any) {
			console.error(err);
			toast({
				title: "Error",
				description: err.message || "Failed to delete idea.",
				variant: "destructive",
			});
		} finally {
			setDeleting(false);
			setIsConfirmDeleteOpen(false);
		}
	};

	const handleComment = async () => {
		if (!ideaId || !commentText.trim()) return;
		setSavingComment(true);
		try {
			await addIdeaComment(ideaId, commentText.trim());
			setCommentText("");
			await loadData();
		} catch (err: any) {
			console.error(err);
			toast({
				title: "Error",
				description: err.message || "Failed to add comment.",
				variant: "destructive",
			});
		} finally {
			setSavingComment(false);
		}
	};

	if (loading) return <div className="h-full p-6 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
	if (error || !detail) return <div className="text-center py-16"><AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" /><p className="text-destructive font-medium">{error || "Idea not found"}</p><Button variant="link" asChild className="mt-2"><Link to="/">Back to Dashboard</Link></Button></div>;

	const idea = detail.idea;

	return (
		<div className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6 flex-1">
			<IdeaActionsHeader
				ideaId={ideaId}
				title={idea?.title}
				deleting={deleting}
				onDelete={() => setIsConfirmDeleteOpen(true)}
			/>

			<AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this idea?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this idea and all associated files. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
							Delete Idea
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<div className="w-full space-y-4">
				<Tabs defaultValue="overview" className="w-full">
					<TabsList className="w-full justify-start border-b rounded-none h-auto bg-transparent p-0 gap-2 overflow-x-auto flex-nowrap">
						<TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5">Overview</TabsTrigger>
						<TabsTrigger value="filesystem" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5">Filesystem</TabsTrigger>
						<TabsTrigger value="comments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs font-medium transition-all gap-1.5">Comments</TabsTrigger>
					</TabsList>
					<TabsContent value="overview" className="space-y-6 pt-4">
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
							<div className="lg:col-span-2 space-y-5">
								<Card><CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="w-4 h-4 text-primary" />Problem Statement</CardTitle></CardHeader><CardContent className="p-4 pt-1"><p className="text-sm">{idea?.problem_statement || idea?.signal_text || "No problem statement defined yet."}</p></CardContent></Card>
								{idea?.solution_concept && <Card><CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="w-4 h-4 text-primary" />Solution Concept</CardTitle></CardHeader><CardContent className="p-4 pt-1"><p className="text-sm">{idea.solution_concept}</p></CardContent></Card>}
								{idea?.source_evidence?.length > 0 && <Card><CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-primary" />Source Evidence &amp; References</CardTitle></CardHeader><CardContent className="p-4 pt-1"><ScrollArea className="max-h-48 pr-2"><ul className="space-y-2">{idea.source_evidence.map((ev: string, i: number) => <li key={i} className="text-xs flex items-start gap-2 border-b last:border-0 pb-1.5"><FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />{ev}</li>)}</ul></ScrollArea></CardContent></Card>}
							</div>
							<div className="space-y-5">
								<Card><CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-semibold">Idea Metadata</CardTitle></CardHeader><CardContent className="p-4 pt-1"><dl className="space-y-2 text-xs"><div className="flex justify-between border-b pb-1"><dt className="text-muted-foreground">Created</dt><dd className="font-mono">{idea?.created_at ? new Date(idea.created_at).toLocaleDateString() : "—"}</dd></div><div className="flex justify-between border-b pb-1"><dt className="text-muted-foreground">Updated</dt><dd className="font-mono">{idea?.updated_at ? new Date(idea.updated_at).toLocaleDateString() : "—"}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Interrupts</dt><dd className="font-semibold">{interrupts.length}</dd></div></dl></CardContent></Card>
							</div>
						</div>
					</TabsContent>
					<TabsContent value="filesystem" className="pt-4"><IdeaFilesystem files={files} ideaId={ideaId || ""} /></TabsContent>
					<TabsContent value="comments" className="space-y-4 pt-4">
						<Card>
							<CardHeader className="p-4 pb-2">
								<CardTitle className="text-sm font-semibold">Add Comment</CardTitle>
							</CardHeader>
							<CardContent className="p-4 pt-1 space-y-3">
								<Textarea
									className="min-h-28 text-sm"
									value={commentText}
									onChange={(e) => setCommentText(e.target.value)}
									placeholder="Write a note for this idea"
								/>
								<div className="flex justify-end">
									<Button onClick={handleComment} disabled={savingComment || !commentText.trim()} className="gap-2">
										<SendHorizonal className="w-4 h-4" />
										Add Comment
									</Button>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
