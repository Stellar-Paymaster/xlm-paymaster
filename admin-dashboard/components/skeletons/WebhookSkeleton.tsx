import { Skeleton } from "@/components/ui/skeleton";

export interface WebhookSkeletonProps {
  /** Number of tenant webhook cards to render. Defaults to 3. */
  cards?: number;
  /** Number of event-type toggle rows per card. Defaults to 3. */
  eventRows?: number;
}

/**
 * Geometry-accurate loading placeholder for <WebhookSettingsManager>.
 *
 * Mirrors the per-tenant card layout:
 *   - Card header: tenant name + ID + last-updated timestamp
 *   - Webhook URL input field
 *   - Event-type section heading
 *   - One toggle row per event type (title + description + switch)
 *   - Save button
 *
 * Card geometry (padding, border-radius, spacing) matches the real
 * shadcn/ui <Card> shell so the swap-in causes zero layout shift.
 */
export function WebhookSkeleton({ cards = 3, eventRows = 3 }: WebhookSkeletonProps) {
  const safeCards = Math.max(1, Math.min(20, Math.trunc(cards)));
  const safeEventRows = Math.max(1, Math.min(10, Math.trunc(eventRows)));

  return (
    <div
      className="space-y-6"
      role="status"
      aria-busy="true"
      aria-label="Loading webhook settings"
      data-testid="webhook-skeleton"
    >
      {Array.from({ length: safeCards }).map((_, cardIndex) => (
        <div
          key={`webhook-card-${cardIndex}`}
          className="rounded-xl border border-border bg-card shadow-sm"
          data-testid="webhook-skeleton-card"
        >
          {/* Card header */}
          <div className="flex flex-col gap-2 p-6 pb-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              {/* CardTitle — tenant name */}
              <Skeleton className="h-5 w-40" label="Loading tenant name" />
              {/* CardDescription — tenant ID */}
              <Skeleton className="h-3 w-52" label="Loading tenant ID" />
            </div>
            {/* Last-updated timestamp */}
            <Skeleton className="h-3 w-36" label="Loading updated timestamp" />
          </div>

          {/* Card content */}
          <div className="space-y-6 p-6">
            {/* Webhook URL field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" label="Loading field label" />
              <Skeleton className="h-10 w-full rounded-md" label="Loading URL input" />
              <Skeleton className="h-3 w-72 max-w-full" label="Loading field hint" />
            </div>

            {/* Event Types section */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" label="Loading section label" />
                <Skeleton className="h-3 w-80 max-w-full" label="Loading section description" />
              </div>

              {/* Toggle rows */}
              <div className="space-y-3">
                {Array.from({ length: safeEventRows }).map((_, rowIndex) => (
                  <div
                    key={`event-row-${cardIndex}-${rowIndex}`}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
                    data-testid="webhook-skeleton-event-row"
                  >
                    <div className="flex-1 space-y-1.5">
                      {/* Event type title */}
                      <Skeleton className="h-4 w-36" label="Loading event type title" />
                      {/* Event type description */}
                      <Skeleton className="h-3 w-64 max-w-full" label="Loading event type description" />
                    </div>
                    {/* Toggle switch */}
                    <Skeleton className="h-6 w-11 rounded-full" label="Loading toggle" />
                  </div>
                ))}
              </div>
            </div>

            {/* Save button */}
            <Skeleton className="h-10 w-28 rounded-md" label="Loading save button" />
          </div>
        </div>
      ))}
    </div>
  );
}
