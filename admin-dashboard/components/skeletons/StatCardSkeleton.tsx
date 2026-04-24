import { Skeleton } from "@/components/ui/skeleton";

/**
 * Geometry-accurate placeholder for <StatCard>. Mirrors the padding
 * (p-6), radius (rounded-3xl), and header/value/delta stack so the
 * swap to live data does not move a single pixel.
 */
export function StatCardSkeleton() {
  return (
    <div
      className="rounded-3xl border border-border/50 glass p-6 shadow-sm"
      data-testid="stat-card-skeleton"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" label="Loading metric label" />
          <Skeleton className="h-8 w-32" label="Loading metric value" />
          <Skeleton className="h-3 w-28" label="Loading metric delta" />
        </div>
        <Skeleton className="h-12 w-12 rounded-2xl" label="Loading metric icon" />
      </div>
    </div>
  );
}
