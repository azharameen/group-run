import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
	return (
		<div className="h-full w-full p-6 space-y-6 animate-pulse">
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-48 rounded-md" />
				<Skeleton className="h-8 w-24 rounded-md" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
			</div>
			<Skeleton className="h-64 w-full rounded-xl" />
		</div>
	);
}
