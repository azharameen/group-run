import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

interface ResearchSectionProps {
	title: string;
	icon: LucideIcon;
	data: Record<string, unknown>;
}

export function ResearchSection({
	title,
	icon: Icon,
	data,
}: ResearchSectionProps) {
	if (!data) return null;
	const [open, setOpen] = useState(false);

	const renderValue = (value: unknown): string => {
		if (typeof value === "string") return value;
		if (Array.isArray(value))
			return value.map((v) => renderValue(v)).join(", ");
		if (typeof value === "object" && value !== null)
			return JSON.stringify(value, null, 2);
		return String(value);
	};

	return (
		<Card>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger asChild>
					<CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-4">
						<div className="flex items-center justify-between">
							<CardTitle className="flex items-center gap-2 text-sm">
								<Icon className="w-4 h-4 text-primary" />
								{title}
							</CardTitle>
							{open ? (
								<ChevronDown className="w-4 h-4 text-muted-foreground" />
							) : (
								<ChevronRight className="w-4 h-4 text-muted-foreground" />
							)}
						</div>
					</CardHeader>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="p-4 pt-0">
						{typeof data === "object" && !Array.isArray(data) ? (
							<div className="space-y-2 text-xs">
								{Object.entries(data).map(([key, value]) => (
									<div key={key}>
										<span className="font-medium text-muted-foreground capitalize">
											{key.replace(/_/g, " ")}:
										</span>{" "}
										<span className="text-foreground">
											{renderValue(value)}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-foreground">{renderValue(data)}</p>
						)}
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
