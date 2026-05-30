/**
 * Congestion level indicators for fee estimation.
 */
export type CongestionLevel = "low" | "medium" | "high";

/**
 * Result of localized fee estimation.
 */
export interface FeeEstimationResult {
  /** Estimated fee in stroops */
  estimatedFee: number;
  /** Currency code (e.g., 'XLM', 'USD') */
  currency: string;
  /** Current congestion level */
  congestionLevel: CongestionLevel;
  /** Multiplier applied to base fee */
  multiplier: number;
}

/**
 * Configuration for congestion multipliers by region.
 */
export interface CongestionConfig {
  /** Region code */
  region: string;
  /** Low congestion multiplier */
  low: number;
  /** Medium congestion multiplier */
  medium: number;
  /** High congestion multiplier */
  high: number;
}