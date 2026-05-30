"use client";

import type { StatusHistoryEntry, HealthStatus } from "../types";

interface StatusHistoryTimelineProps {
  /** History entries grouped by region */
  history: StatusHistoryEntry[];
  /** Number of days to show (default: 90) */
  days?: number;
}

/**
 * Renders a timeline of status history for the last N days.
 * Similar to statuspage.io style timeline visualization.
 */
export function StatusHistoryTimeline({
  history,
  days = 90,
}: StatusHistoryTimelineProps) {
  function getStatusColor(status: HealthStatus): string {
    switch (status) {
      case "operational":
        return "bg-green-500";
      case "degraded":
        return "bg-yellow-500";
      case "outage":
        return "bg-red-500";
      default:
        return "bg-gray-300";
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // Group history by region
  const regions = Array.from(new Set(history.map((h) => h.region)));
  const regionHistory = regions.map((region) => ({
    region,
    entries: history.filter((h) => h.region === region),
  }));

  return (
    <div className="p-6" data-testid="status-history-timeline">
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Status History (Last {days} Days)
      </h2>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Header with dates */}
          <div className="flex">
            <div className="w-24 flex-shrink-0 font-medium text-sm text-gray-600 dark:text-gray-400">
              Region
            </div>
            <div className="flex gap-px">
              {Array.from({ length: Math.min(days, 30) }).map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (days - 1 - i));
                return (
                  <div
                    key={i}
                    className="w-8 text-center text-xs text-gray-500 dark:text-gray-500"
                    title={date.toLocaleDateString()}
                  >
                    {date.getDate()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Region rows */}
          {regionHistory.map(({ region, entries }) => (
            <div key={region} className="flex items-center py-2 border-t border-gray-200 dark:border-gray-700">
              <div className="w-24 flex-shrink-0 font-medium text-sm text-gray-800 dark:text-gray-200">
                {region}
              </div>
              <div className="flex gap-px">
                {Array.from({ length: Math.min(days, 30) }).map((_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (days - 1 - i));
                  const dateStr = date.toISOString().split("T")[0];
                  const entry = entries.find((e) => e.date === dateStr);
                  
                  return (
                    <div
                      key={i}
                      className="w-8 h-6"
                      title={entry ? `${dateStr}: ${entry.status}` : `${dateStr}: no data`}
                    >
                      {entry ? (
                        <div
                          className={`w-full h-full rounded-sm ${getStatusColor(entry.status)}`}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-sm" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}