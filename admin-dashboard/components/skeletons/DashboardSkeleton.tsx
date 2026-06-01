import { ChartSkeleton } from "./ChartSkeleton";
import { StatCardSkeleton } from "./StatCardSkeleton";
import { TableSkeleton } from "./TableSkeleton";

/**
 * Full admin dashboard placeholder. Used as the Next.js `loading.tsx` for the
 * /admin/dashboard route — renders immediately while the server component
 * awaits its data fetchers, preserving header/stats/chart/table geometry.
 */
export function DashboardSkeleton() {
  return (
    <div
      className="min-h-screen bg-background"
      role="status"
      aria-busy="true"
      aria-label="Loading admin dashboard"
      data-testid="dashboard-skeleton"
    >
      <div className="border-b border-border/50 glass sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="h-3 w-24 rounded-md bg-muted/60 motion-safe:animate-pulse" />
              <div className="h-10 w-80 rounded-md bg-muted/60 motion-safe:animate-pulse" />
              <div className="h-3 w-96 max-w-full rounded-md bg-muted/60 motion-safe:animate-pulse" />
            </div>
            <div className="h-14 w-56 rounded-2xl bg-muted/60 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          aria-label="Loading key metrics"
        >
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2" aria-label="Loading charts">
          <ChartSkeleton />
          <ChartSkeleton />
        </section>

        <section className="mt-6 space-y-6" aria-label="Loading tables">
          <TableSkeleton rows={6} columns={5} label="Loading transactions" />
          <TableSkeleton rows={4} columns={4} label="Loading signers" />
        </section>
      </main>
    </div>
  );
}
