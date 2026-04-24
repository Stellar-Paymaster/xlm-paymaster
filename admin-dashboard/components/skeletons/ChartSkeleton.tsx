import { Skeleton } from "@/components/ui/skeleton";
import { clampLegendRows } from "./skeleton-utils";

export interface ChartSkeletonProps {
  /** Height of the chart area in Tailwind spacing units. Defaults to 56. */
  heightClass?: string;
  /** Number of fake legend rows. Defaults to 2. */
  legendRows?: number;
  label?: string;
}

/**
 * Geometry-accurate placeholder for Recharts-based cards (<SpendChart>,
 * <ExpenseBreakdown>). Preserves the card chrome, heading row, and chart
 * canvas height so swap-in of the real chart is pixel-stable.
 */
export function ChartSkeleton({
  heightClass = "h-56",
  legendRows,
  label = "Loading chart",
}: ChartSkeletonProps) {
  const safeLegendRows = clampLegendRows(legendRows);

  return (
    <div
      className="rounded-3xl border border-border/50 glass p-6 shadow-sm"
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid="chart-skeleton"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" label="Loading chart heading" />
          <Skeleton className="h-3 w-28" label="Loading chart subtitle" />
        </div>
        <Skeleton className="h-8 w-24 rounded-full" label="Loading chart filter" />
      </div>

      <Skeleton className={`mt-6 w-full ${heightClass}`} label="Loading chart canvas" />

      {safeLegendRows > 0 && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: safeLegendRows }).map((_, index) => (
            <div key={`legend-${index}`} className="flex items-center gap-3">
              <Skeleton className="h-3 w-3 rounded-full" label="Loading legend swatch" />
              <Skeleton className="h-3 flex-1" label="Loading legend label" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
