/**
 * Rust fee-bump formula mirror for cross-stack parity checks.
 * Matches paymaster-server/src/stellar.rs create_fee_bump_transaction logic.
 */
export function calculateRustFeeBumpAmount(
  operationCount: number,
  baseFee: number,
  multiplier: number,
): number {
  return Math.ceil((operationCount + 1) * baseFee * multiplier);
}

/**
 * Total outer envelope fee field (fee_amount * (operation_count + 1)).
 */
export function calculateRustOuterFee(
  operationCount: number,
  baseFee: number,
  multiplier: number,
): number {
  const feeAmount = calculateRustFeeBumpAmount(operationCount, baseFee, multiplier);
  return feeAmount * (operationCount + 1);
}

export interface CongestionScenario {
  name: string;
  p70: number;
  p95: number;
  expectedMultiplier: number;
  expectedCongestion: "low" | "high";
}

export const CONGESTION_SCENARIOS: CongestionScenario[] = [
  {
    name: "low-congestion",
    p70: 90,
    p95: 120,
    expectedMultiplier: 1.0,
    expectedCongestion: "low",
  },
  {
    name: "high-congestion",
    p70: 300,
    p95: 800,
    expectedMultiplier: 2.0,
    expectedCongestion: "high",
  },
  {
    name: "boundary-at-threshold",
    p70: 400,
    p95: 400,
    expectedMultiplier: 2.0,
    expectedCongestion: "high",
  },
  {
    name: "just-below-threshold",
    p70: 399,
    p95: 399,
    expectedMultiplier: 1.0,
    expectedCongestion: "low",
  },
];

export function deriveMultiplierFromFeeStats(
  p70: number,
  p95: number,
  baseFee: number,
): { multiplier: number; congestionLevel: "low" | "high"; ratio: number } {
  const ratio = Math.max(p70, p95) / Math.max(1, baseFee);
  const congestionLevel = ratio >= 4 ? "high" : "low";
  const multiplier = congestionLevel === "high" ? 2.0 : 1.0;
  return { multiplier, congestionLevel, ratio };
}
