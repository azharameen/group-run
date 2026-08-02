import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { BookOpen, ChevronDown, ChevronRight, File, Globe } from "lucide-react";
import type { KBDocument, KnowledgeBaseData } from "@/api/client";

interface DocumentViewerCardProps {
	kbData: KnowledgeBaseData | null;
	expandedCategories: Set<string>;
	toggleCategory: (cat: string) => void;
	expandedDocs: Set<string>;
	toggleDocExpand: (path: string) => void;
	expandedDoc: KBDocument | null;
	setExpandedDoc: (doc: KBDocument | null) => void;
}

export function DocumentViewerCard({
	kbData,
	expandedCategories,
	toggleCategory,
	expandedDocs,
	toggleDocExpand,
	expandedDoc,
	setExpandedDoc,
}: DocumentViewerCardProps) {
	return (
		<>
			{kbData && kbData.documents.length > 0 && (
				<Card className="overflow-hidden">
					<button
						onClick={() => toggleCategory("knowledge")}
						className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors"
					>
						<div className="flex items-center gap-2">
							<BookOpen className="w-4 h-4 text-primary" />
							<h3 className="text-sm font-semibold">Local Knowledge Documents</h3>
							<Badge variant="secondary" className="text-xs">{kbData.documents.length}</Badge>
						</div>
						{expandedCategories.has("knowledge") ? (
							<ChevronDown className="w-4 h-4 text-muted-foreground" />
						) : (
							<ChevronRight className="w-4 h-4 text-muted-foreground" />
						)}
					</button>
					{expandedCategories.has("knowledge") && <Separator />}
					{expandedCategories.has("knowledge") && (
						<div className="divide-y">
							{kbData.documents.map((doc, i) => (
								<div key={i}>
									<button
										onClick={() => toggleDocExpand(doc.path)}
										className="w-full flex items-center justify-between p-3.5 px-4 text-left hover:bg-muted/20 transition-colors"
									>
										<div className="flex items-center gap-2 min-w-0">
											<File className="w-4 h-4 shrink-0 text-muted-foreground" />
											<span className="text-xs font-mono text-foreground truncate">{doc.path}</span>
											<Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
												{doc.source}
											</Badge>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<Button
												variant="ghost"
												size="sm"
												className="h-7 text-xs"
												onClick={(e) => {
													e.stopPropagation();
													setExpandedDoc(doc);
												}}
											>
												View Content
											</Button>
											{expandedDocs.has(doc.path) ? (
												<ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
											) : (
												<ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
											)}
										</div>
									</button>
									{expandedDocs.has(doc.path) && (
										<div className="px-4 pb-3 pt-1 pl-10">
											<pre className="text-xs text-muted-foreground bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
												{typeof doc.content === "string" ? doc.content : JSON.stringify(doc.content, null, 2)}
											</pre>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</Card>
			)}

			<Card className="overflow-hidden">
				<CardHeader className="p-4 border-b bg-muted/20">
					<CardTitle className="text-sm font-semibold">External Patent & Knowledge Sources</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<p className="text-xs text-muted-foreground mb-3">
						Knowledge agents search external sources during the prior art and research phases.
						Results appear in each idea's Research Data tab once processed.
					</p>
					<div className="flex flex-wrap gap-2">
						{[
							"Google Patents",
							"Espacenet (EPO)",
							"USPTO",
							"WIPO PATENTSCOPE",
							"DPMA",
							"GitHub",
							"Wikipedia",
							"Hugging Face",
						].map((name) => (
							<Badge key={name} variant="secondary" className="text-xs gap-1">
								<Globe className="w-3 h-3" />
								{name}
							</Badge>
						))}
					</div>
				</CardContent>
			</Card>

			<Dialog open={!!expandedDoc} onOpenChange={(open) => !open && setExpandedDoc(null)}>
				<DialogContent className="max-w-2xl max-h-[80vh]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 font-mono text-sm">
							<File className="w-4 h-4 text-primary" />
							{expandedDoc?.path ?? ""}
						</DialogTitle>
						<DialogDescription>
							Source: {expandedDoc?.source} &middot; {expandedDoc?.filename}
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[60vh]">
						<pre className="text-xs text-foreground bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap font-mono">
							{expandedDoc
								? typeof expandedDoc.content === "string"
									? expandedDoc.content
									: JSON.stringify(expandedDoc.content, null, 2)
								: ""}
						</pre>
					</ScrollArea>
				</DialogContent>
			</Dialog>
		</>
	);
}
