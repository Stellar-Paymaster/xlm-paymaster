import { useState, useEffect, useCallback } from "react";
import type { RegionStatus, StatusApiResponse } from "../types";

/**
 * Hook for fetching and managing region health status.
 * Reads API endpoint from STATUS_API_URL environment variable.
 * @param refreshInterval - Auto-refresh interval in milliseconds (default: 30000)
 * @returns Object containing regions data, loading state, and error state
 */
export function useRegionHealth(refreshInterval = 30000) {
  const [regions, setRegions] = useState<RegionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    const apiUrl = process.env.STATUS_API_URL?.trim();
    
    if (!apiUrl) {
      setError("STATUS_API_URL not configured");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const data = (await response.json()) as StatusApiResponse;
      setRegions(data.regions || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out after 10 seconds");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch status data");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchHealth, refreshInterval]);

  return {
    regions,
    loading,
    error,
    refetch: fetchHealth,
  };
}