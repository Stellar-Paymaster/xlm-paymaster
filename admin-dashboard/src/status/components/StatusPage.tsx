"use client";

import { useRegionHealth } from "../hooks/useRegionHealth";
import { cn } from "@/lib/utils";
import type { HealthStatus } from "../types";

/**
 * Status page component displaying real-time health of all regions.
 * Shows status cards with color-coded indicators and auto-refreshes every 30 seconds.
 */
export function StatusPage() {
  const { regions, loading, error } = useRegionHealth(30000);

  function getStatusColor(status: HealthStatus): string {
    switch (status) {
      case "operational":
        return "bg-green-500";
      case "degraded":
        return "bg-yellow-500";
      case "outage":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  }

  function getStatusText(status: HealthStatus): string {
    switch (status) {
      case "operational":
        return "Operational";
      case "degraded":
        return "Degraded";
      case "outage":
        return "Outage";
      default:
        return "Unknown";
    }
  }

  if (loading && regions.length === 0) {
    return (
      <div className="p-6" data-testid="status-loading">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && regions.length === 0) {
    return (
      <div className="p-6" data-testid="status-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Error loading status data</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        System Status
      </h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {regions.map((region) => (
          <div
            key={region.region}
            className={cn(
              "rounded-lg border p-4 dark:border-gray-700",
              "bg-white dark:bg-gray-800 shadow-sm"
            )}
            data-testid={`region-card-${region.region.toLowerCase()}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                {region.name}
              </h2>
              <span
                className={cn(
                  "w-3 h-3 rounded-full",
                  getStatusColor(region.status)
                )}
                title={getStatusText(region.status)}
                aria-label={getStatusText(region.status)}
              />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Status</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {getStatusText(region.status)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Latency</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">
                  {region.latencyMs} ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Uptime</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">
                  {region.uptimePercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Last Checked</span>
                <span className="text-xs text-gray-500 dark:text-gray-500">
                  {new Date(region.lastChecked).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}