import * as React from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

interface ThinkingProps {
	tokens: string[];
}

/**
 * Thinking — collapsible reasoning/thought process display component.
 * Shows the AI's step-by-step thought process in a collapsible panel.
 */
export const Thinking: React.FC<ThinkingProps> = ({ tokens }) => {
	const [isOpen, setIsOpen] = React.useState(true);

	if (!tokens || tokens.length === 0) return null;

	return (
		<div className="mb-1.5 border rounded-lg bg-muted/30 overflow-hidden text-[11px]">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-full flex items-center justify-between px-2 py-1 bg-muted/50 text-muted-foreground hover:text-foreground font-semibold text-[10px]"
			>
				<div className="flex items-center gap-1">
					<Brain className="w-3 h-3 text-primary animate-pulse" />
					<span>Thought Process ({tokens.length} steps)</span>
				</div>
				{isOpen ? (
					<ChevronDown className="w-3 h-3" />
				) : (
					<ChevronRight className="w-3 h-3" />
				)}
			</button>

			{isOpen && (
				<div className="p-2 space-y-1 font-mono text-[10px] text-muted-foreground border-t">
					{tokens.map((token, idx) => (
						<div key={idx} className="leading-tight flex items-start gap-1">
							<span className="text-primary font-bold">›</span>
							<span className="flex-1">{token}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};
Thinking.displayName = "Thinking";
