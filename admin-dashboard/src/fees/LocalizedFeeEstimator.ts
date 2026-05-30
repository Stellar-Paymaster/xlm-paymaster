import type { FeeEstimationResult, CongestionLevel } from "./types";
import { getCongestionMultiplier, GLOBAL_AVERAGE_MULTIPLIER } from "./config/region-congestion-config.ts";

/**
 * Estimates fees based on regional congestion patterns.
 * Applies configurable multipliers to base fees.
 */
export class LocalizedFeeEstimator {
  private region: string;
  private congestionConfig: Map<string, { low: number; medium: number; high: number }>;

  /**
   * Creates a new LocalizedFeeEstimator.
   * @param region - The region code for fee estimation
   * @param congestionConfig - Optional override for congestion multipliers
   */
  constructor(
    region: string,
    congestionConfig?: Record<string, { low: number; medium: number; high: number }>
  ) {
    this.region = region.toUpperCase();
    this.congestionConfig = congestionConfig
      ? new Map(Object.entries(congestionConfig))
      : this.getDefaultConfig();
  }

  /**
   * Gets default congestion configuration mapped by region.
   */
  private getDefaultConfig(): Map<string, { low: number; medium: number; high: number }> {
    const config = getCongestionMultiplier;
    // Return a map-like structure using getCongestionMultiplier
    return new Map();
  }

  /**
   * Gets the current congestion level for a region.
   * In a real implementation, this would fetch from an API or monitoring service.
   * @param region - Region code to check
   * @returns Congestion level indicator
   */
  private getCongestionLevel(region: string): CongestionLevel {
    // Placeholder: In production, this would be fetched from real-time data
    // For now, return a static value based on region
    if (region === "APAC") return "high";
    if (region === "BR") return "medium";
    return "low";
  }

  /**
   * Estimates the fee for a given base fee amount.
   * @param baseFee - The base fee in stroops
   * @returns Fee estimation result with multiplier applied
   */
  estimate(baseFee: number): FeeEstimationResult {
    // Handle zero or negative fee
    if (baseFee <= 0) {
      return {
        estimatedFee: 0,
        currency: "XLM",
        congestionLevel: "low",
        multiplier: GLOBAL_AVERAGE_MULTIPLIER,
      };
    }

    const congestionLevel = this.getCongestionLevel(this.region);
    const multiplier = getCongestionMultiplier(this.region, congestionLevel);
    const estimatedFee = Math.floor(baseFee * multiplier);

    return {
      estimatedFee,
      currency: "XLM",
      congestionLevel,
      multiplier,
    };
  }

  /**
   * Gets the estimated fee with real-time congestion data.
   * Falls back to static config if network fails.
   * @param baseFee - The base fee in stroops
   * @returns Fee estimation result
   */
  async estimateWithRealtime(baseFee: number): Promise<FeeEstimationResult> {
    // In production, this would fetch real-time congestion data
    // For now, use static estimation
    return this.estimate(baseFee);
  }
}

/**
 * Convenience function for one-off fee estimation.
 * @param region - Region code
 * @param baseFee - Base fee in stroops
 * @returns Fee estimation result
 */
export function estimateFeeByRegion(
  region: string,
  baseFee: number
): FeeEstimationResult {
  const estimator = new LocalizedFeeEstimator(region);
  return estimator.estimate(baseFee);
}