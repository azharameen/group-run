import { useRef, type ChangeEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { ingestKnowledgeBaseDocument } from "@/api/client";

interface DocumentUploadCardProps {
	uploading: boolean;
	setUploading: (val: boolean) => void;
	onSuccess: () => Promise<void>;
}

export function DocumentUploadCard({
	uploading,
	setUploading,
	onSuccess,
}: DocumentUploadCardProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleUploadClick = () => {
		fileInputRef.current?.click();
	};

	const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setUploading(true);
		try {
			const res = await ingestKnowledgeBaseDocument({
				file,
				source: "raw",
			});
			if (res.success) {
				await onSuccess();
			}
		} catch (err) {
			console.error("Document upload error:", err);
		} finally {
			setUploading(false);
			event.target.value = "";
		}
	};

	return (
		<Card className="border-2 border-dashed bg-muted/20 hover:border-primary/50 transition-colors">
			<CardContent className="p-8 text-center space-y-2">
				<Upload className="w-10 h-10 text-muted-foreground mx-auto" />
				<h3 className="font-semibold text-base">Upload Custom Knowledge Documents</h3>
				<p className="text-sm text-muted-foreground max-w-md mx-auto">
					Upload PDFs or images directly, or place Markdown/text files in{" "}
					<code className="text-xs bg-muted px-1.5 py-0.5 rounded border font-mono">
						knowledge-base/raw/
					</code>
				</p>
				<p className="text-xs text-muted-foreground">
					The autonomous Knowledge Curator agent automatically extracts technical signals from newly added files.
				</p>
				<div className="pt-2 flex items-center justify-center gap-2">
					<Button variant="outline" size="sm" onClick={handleUploadClick} disabled={uploading}>
						{uploading ? <Loader2 data-testid="loader" className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
						Upload file
					</Button>
					<input
						ref={fileInputRef}
						data-testid="file-input"
						type="file"
						className="hidden"
						accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
						onChange={handleUpload}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
