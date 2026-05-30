/**
 * Health status levels for a region.
 */
export type HealthStatus = "operational" | "degraded" | "outage";

/**
 * Status information for a single region.
 */
export interface RegionStatus {
  /** Region code (e.g., 'US', 'EU', 'BR', 'APAC') */
  region: string;
  /** Human-readable region name */
  name: string;
  /** Current health status */
  status: HealthStatus;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Uptime percentage over last 30 days */
  uptimePercent: number;
  /** Last checked timestamp (ISO string) */
  lastChecked: string;
}

/**
 * Response shape from the status API endpoint.
 */
export interface StatusApiResponse {
  /** Array of region statuses */
  regions: RegionStatus[];
  /** Timestamp of the response */
  timestamp: string;
  /** Overall system status */
  overall: HealthStatus;
}

/**
 * Status history entry for the timeline.
 */
export interface StatusHistoryEntry {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Region code */
  region: string;
  /** Status for that day */
  status: HealthStatus;
  /** Average latency that day */
  avgLatencyMs: number;
}