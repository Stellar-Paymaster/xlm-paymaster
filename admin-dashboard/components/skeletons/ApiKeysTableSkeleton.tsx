import { Skeleton } from "@/components/ui/skeleton";

export interface ApiKeysTableSkeletonProps {
  /** Number of skeleton rows to render. Defaults to 6. */
  rows?: number;
}

/**
 * Geometry-accurate loading placeholder for <ApiKeysTable>.
 *
 * Mirrors the six-column layout exactly:
 *   Key | Tenant | Chains | Created | Status | Action
 *
 * Column proportions and row heights are kept in sync with the real table
 * so swapping in live data causes zero layout shift.
 */
export function ApiKeysTableSkeleton({ rows = 6 }: ApiKeysTableSkeletonProps) {
  const safeRows = Math.max(1, Math.min(50, Math.trunc(rows)));

  return (
    <div
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      role="status"
      aria-busy="true"
      aria-label="Loading API keys"
      data-testid="api-keys-table-skeleton"
    >
      {/* Card header */}
      <div className="border-b border-slate-200 px-5 py-4">
        <Skeleton className="h-5 w-24" label="Loading heading" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" label="Loading description" />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full" aria-hidden="true">
          {/* Column header row */}
          <thead className="bg-slate-50">
            <tr>
              {/* Key */}
              <th className="px-5 py-3 text-left w-[22%]">
                <Skeleton className="h-3 w-8" label="Loading column header" />
              </th>
              {/* Tenant (hidden on mobile) */}
              <th className="hidden px-5 py-3 text-left w-[18%] sm:table-cell">
                <Skeleton className="h-3 w-12" label="Loading column header" />
              </th>
              {/* Chains */}
              <th className="px-5 py-3 text-left w-[24%]">
                <Skeleton className="h-3 w-12" label="Loading column header" />
              </th>
              {/* Created (hidden on mobile) */}
              <th className="hidden px-5 py-3 text-left w-[14%] md:table-cell">
                <Skeleton className="h-3 w-14" label="Loading column header" />
              </th>
              {/* Status */}
              <th className="px-5 py-3 text-left w-[12%]">
                <Skeleton className="h-3 w-12" label="Loading column header" />
              </th>
              {/* Action */}
              <th className="px-5 py-3 text-right w-[10%]">
                <Skeleton className="ml-auto h-3 w-12" label="Loading column header" />
              </th>
            </tr>
          </thead>

          {/* Data rows */}
          <tbody className="divide-y divide-slate-100 bg-white">
            {Array.from({ length: safeRows }).map((_, rowIndex) => (
              <tr key={`api-key-row-${rowIndex}`} data-testid="api-keys-table-skeleton-row">
                {/* Key — monospace pill */}
                <td className="px-5 py-4">
                  <Skeleton className="h-4 w-40" label="Loading key" />
                </td>
                {/* Tenant */}
                <td className="hidden px-5 py-4 sm:table-cell">
                  <Skeleton className="h-4 w-24" label="Loading tenant" />
                </td>
                {/* Chains — four badge-like pills */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-5 w-12 rounded-full" label="Loading chain badge" />
                    <Skeleton className="h-5 w-9 rounded-full" label="Loading chain badge" />
                    <Skeleton className="h-5 w-14 rounded-full" label="Loading chain badge" />
                    <Skeleton className="h-5 w-16 rounded-full" label="Loading chain badge" />
                  </div>
                </td>
                {/* Created */}
                <td className="hidden px-5 py-4 md:table-cell">
                  <Skeleton className="h-4 w-24" label="Loading date" />
                </td>
                {/* Status badge */}
                <td className="px-5 py-4">
                  <Skeleton className="h-6 w-16 rounded-full" label="Loading status" />
                </td>
                {/* Action button */}
                <td className="px-5 py-4 text-right">
                  <Skeleton className="ml-auto h-7 w-16 rounded-full" label="Loading action" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
