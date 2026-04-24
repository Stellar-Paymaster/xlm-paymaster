import { Skeleton } from "@/components/ui/skeleton";
import {
  clampTableColumns,
  clampTableRows,
  gridStyleForColumns as sharedGridStyleForColumns,
} from "./skeleton-utils";

export interface TableSkeletonProps {
  /** Number of skeleton rows to render. Defaults to 5. */
  rows?: number;
  /** Number of skeleton columns to render. Defaults to 4. */
  columns?: number;
  /** Optional heading placeholder above the table. */
  showHeading?: boolean;
  /** Accessible label for the whole table region. */
  label?: string;
}

/**
 * Geometry-accurate placeholder for data tables (transactions, signers, users,
 * api-keys, etc.). The row height, column widths, and outer padding match
 * the real <TransactionsTable>/<SignersTable>/<AdminUsersTable> shells so the
 * page layout is stable while the server component resolves.
 */
export function TableSkeleton({
  rows,
  columns,
  showHeading = true,
  label = "Loading table",
}: TableSkeletonProps) {
  const safeRows = clampTableRows(rows);
  const safeColumns = clampTableColumns(columns);

  return (
    <div
      className="rounded-3xl border border-border/50 glass p-6 shadow-sm"
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid="table-skeleton"
    >
      {showHeading && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-40" label="Loading table heading" />
          <Skeleton className="h-8 w-24 rounded-full" label="Loading action" />
        </div>
      )}

      <div className="grid gap-3" style={gridStyleForColumns(safeColumns)}>
        {Array.from({ length: safeColumns }).map((_, index) => (
          <Skeleton
            key={`head-${index}`}
            className="h-3 w-full"
            label="Loading column header"
          />
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {Array.from({ length: safeRows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="grid gap-3"
            style={gridStyleForColumns(safeColumns)}
            data-testid="table-skeleton-row"
          >
            {Array.from({ length: safeColumns }).map((_, colIndex) => (
              <Skeleton
                key={`cell-${rowIndex}-${colIndex}`}
                className="h-4 w-full"
                label="Loading cell"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function gridStyleForColumns(columns: number): React.CSSProperties {
  return sharedGridStyleForColumns(columns) as React.CSSProperties;
}
