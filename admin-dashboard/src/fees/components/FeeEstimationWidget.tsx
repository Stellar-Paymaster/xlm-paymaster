"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { LocalizedFeeEstimator } from "../LocalizedFeeEstimator";
import type { FeeEstimationResult, CongestionLevel } from "../../types";

interface FeeEstimationWidgetProps {
  /** Detected or selected region code */
  region: string;
  /** Base fee in stroops */
  baseFee?: number;
  /** Callback when region changes */
  onRegionChange?: (region: string) => void;
}

/**
 * Widget component displaying localized fee estimation.
 * Shows estimated fee, congestion level badge, and fee breakdown.
 */
export function FeeEstimationWidget({
  region,
  baseFee = 100,
  onRegionChange,
}: FeeEstimationWidgetProps) {
  const [estimation, setEstimation] = useState<FeeEstimationResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchEstimation() {
      setLoading(true);
      try {
        const estimator = new LocalizedFeeEstimator(region);
        const result = await estimator.estimateWithRealtime(baseFee);
        setEstimation(result);
      } catch {
        // Fallback to static estimation
        const estimator = new LocalizedFeeEstimator(region);
        setEstimation(estimator.estimate(baseFee));
      } finally {
        setLoading(false);
      }
    }
    
    fetchEstimation();
  }, [region, baseFee]);

  function getCongestionColor(level: CongestionLevel): string {
    switch (level) {
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400";
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400";
    }
  }

  if (!estimation) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Localized Fee Estimation
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Region: {region.toUpperCase()}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Base Fee</span>
          <span className="font-mono text-sm text-gray-800 dark:text-gray-200">
            {baseFee} stroops
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Regional Adjustment</span>
          <span className="font-mono text-sm text-gray-800 dark:text-gray-200">
            × {estimation.multiplier.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Estimated Fee</span>
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
            {estimation.estimatedFee} stroops
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Congestion:</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
            getCongestionColor(estimation.congestionLevel)
          )}
        >
          {estimation.congestionLevel}
        </span>
      </div>

      {loading && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Updating...
        </p>
      )}
    </div>
  );
}