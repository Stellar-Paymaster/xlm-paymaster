import { Skeleton } from "@/components/ui/skeleton";

export interface SignerPoolSkeletonProps {
  /** Number of skeleton signer rows to render. Defaults to 5. */
  rows?: number;
}

/**
 * Geometry-accurate loading placeholder for <SignerPoolManager>.
 *
 * Mirrors the full layout:
 *   - Three summary stat cards (Active / Low Balance / Sequence Errors)
 *   - Signer pool table with columns:
 *     Signer | Status | Balance | Source | In Flight | Sequence | Actions
 *
 * All padding, heights, and border-radii are kept in sync with the real
 * component so swapping to live data causes zero layout shift.
 */
export function SignerPoolSkeleton({ rows = 5 }: SignerPoolSkeletonProps) {
  const safeRows = Math.max(1, Math.min(50, Math.trunc(rows)));

  return (
    <div
      className="space-y-6"
      role="status"
      aria-busy="true"
      aria-label="Loading signer pool"
      data-testid="signer-pool-skeleton"
    >
      {/* Stat cards — Active / Low Balance / Sequence Errors */}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Loading signer metrics">
        {(["emerald", "amber", "rose"] as const).map((color) => (
          <div
            key={color}
            className={`rounded-[2rem] border border-${color}-200 bg-${color}-50/80 p-5 shadow-sm`}
          >
            <Skeleton className="h-3 w-20" label="Loading stat label" />
            <Skeleton className="mt-3 h-10 w-12" label="Loading stat value" />
            <Skeleton className="mt-2 h-3 w-52 max-w-full" label="Loading stat description" />
          </div>
        ))}
      </section>

      {/* Signer pool table */}
      <section
        className="rounded-[2rem] border border-slate-200 bg-white shadow-sm"
        aria-label="Loading signer pool table"
      >
        {/* Table header bar */}
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" label="Loading table title" />
            <Skeleton className="h-3 w-80 max-w-full" label="Loading table description" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-40 rounded-full" label="Loading wallet button" />
            <Skeleton className="h-11 w-36 rounded-full" label="Loading add signer button" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full" aria-hidden="true">
            <thead className="bg-slate-50">
              <tr className="text-left">
                {/* Signer */}
                <th className="px-5 py-3 w-[28%]">
                  <Skeleton className="h-3 w-12" label="Loading column header" />
                </th>
                {/* Status */}
                <th className="px-5 py-3 w-[12%]">
                  <Skeleton className="h-3 w-12" label="Loading column header" />
                </th>
                {/* Balance */}
                <th className="px-5 py-3 w-[12%]">
                  <Skeleton className="h-3 w-14" label="Loading column header" />
                </th>
                {/* Source */}
                <th className="px-5 py-3 w-[10%]">
                  <Skeleton className="h-3 w-12" label="Loading column header" />
                </th>
                {/* In Flight (hidden < lg) */}
                <th className="hidden px-5 py-3 w-[10%] lg:table-cell">
                  <Skeleton className="h-3 w-14" label="Loading column header" />
                </th>
                {/* Sequence (hidden < xl) */}
                <th className="hidden px-5 py-3 w-[10%] xl:table-cell">
                  <Skeleton className="h-3 w-16" label="Loading column header" />
                </th>
                {/* Actions */}
                <th className="px-5 py-3 text-right">
                  <Skeleton className="ml-auto h-3 w-14" label="Loading column header" />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {Array.from({ length: safeRows }).map((_, rowIndex) => (
                <tr key={`signer-row-${rowIndex}`} data-testid="signer-pool-skeleton-row">
                  {/* Signer — truncated hash + full key beneath */}
                  <td className="px-5 py-4">
                    <Skeleton className="h-4 w-32" label="Loading signer hash" />
                    <Skeleton className="mt-2 h-3 w-56 max-w-full" label="Loading signer key" />
                  </td>
                  {/* Status badge */}
                  <td className="px-5 py-4">
                    <Skeleton className="h-6 w-20 rounded-full" label="Loading status" />
                  </td>
                  {/* Balance */}
                  <td className="px-5 py-4">
                    <Skeleton className="h-4 w-20" label="Loading balance" />
                  </td>
                  {/* Source badge */}
                  <td className="px-5 py-4">
                    <Skeleton className="h-6 w-12 rounded-full" label="Loading source" />
                  </td>
                  {/* In Flight */}
                  <td className="hidden px-5 py-4 lg:table-cell">
                    <Skeleton className="h-4 w-8" label="Loading in-flight count" />
                  </td>
                  {/* Sequence */}
                  <td className="hidden px-5 py-4 xl:table-cell">
                    <Skeleton className="h-4 w-16" label="Loading sequence number" />
                  </td>
                  {/* Actions */}
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-8 w-14 rounded-full" label="Loading copy action" />
                      <Skeleton className="h-8 w-20 rounded-full" label="Loading remove action" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
