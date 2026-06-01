import { TableSkeleton, type TableSkeletonProps } from "./TableSkeleton";
import { clampToolbars } from "./skeleton-utils";

export interface AdminPageSkeletonProps {
  /** Displayed in the muted eyebrow over the heading. Defaults to "Fluid Admin". */
  eyebrow?: string;
  /** Approximate width of the title placeholder, Tailwind class. */
  titleWidthClass?: string;
  /** Number of skeleton rows in the main table. Defaults to 8. */
  rows?: number;
  /** Number of skeleton columns in the main table. Defaults to 5. */
  columns?: number;
  /** Optional label used on the table skeleton for assistive tech. */
  tableLabel?: string;
  /** Extra pre-table placeholder blocks (filters, toolbars, etc.). */
  toolbars?: number;
}

/**
 * Shared skeleton shell for admin CRUD / listing pages. Mirrors the typical
 * layout: sticky header with eyebrow + title + session chip, optional
 * toolbar row, and a geometry-accurate table placeholder beneath.
 */
export function AdminPageSkeleton({
  titleWidthClass = "w-72",
  rows = 8,
  columns = 5,
  tableLabel,
  toolbars = 1,
}: AdminPageSkeletonProps) {
  const toolbarCount = clampToolbars(toolbars);
  const tableProps: TableSkeletonProps = { rows, columns, label: tableLabel };

  return (
    <main
      className="min-h-screen bg-slate-100"
      role="status"
      aria-busy="true"
      aria-label={tableLabel ?? "Loading admin page"}
      data-testid="admin-page-skeleton"
    >
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-md bg-muted/60 motion-safe:animate-pulse" />
              <div className={`h-8 rounded-md bg-muted/60 motion-safe:animate-pulse ${titleWidthClass}`} />
              <div className="h-3 w-80 max-w-full rounded-md bg-muted/60 motion-safe:animate-pulse" />
            </div>
            <div className="h-12 w-48 rounded-2xl bg-muted/60 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {toolbarCount > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {Array.from({ length: toolbarCount }).map((_, index) => (
              <div
                key={`toolbar-${index}`}
                className="h-10 w-40 rounded-full bg-muted/60 motion-safe:animate-pulse"
              />
            ))}
          </div>
        )}
        <TableSkeleton {...tableProps} />
      </div>
    </main>
  );
}
