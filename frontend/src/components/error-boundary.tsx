import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("Uncaught Error Boundary catch:", error, errorInfo);
	}

	public render() {
		if (this.state.hasError) {
			return (
				<div className="h-full w-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-background text-foreground">
					<div className="p-4 rounded-full bg-destructive/10 text-destructive">
						<AlertTriangle className="w-10 h-10" />
					</div>
					<div className="space-y-2 max-w-md">
						<h2 className="text-lg font-bold">Something went wrong</h2>
						<p className="text-xs text-muted-foreground font-mono bg-muted/40 p-3 rounded-lg text-left overflow-x-auto">
							{this.state.error?.message || "An unexpected error occurred in the application."}
						</p>
					</div>
					<Button
						onClick={() => {
							this.setState({ hasError: false, error: null });
							window.location.reload();
						}}
						size="sm"
						className="gap-2 text-xs"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						Reload Application
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}
