import { describe, expect, it } from "vitest";
import { calculateFeeBumpFee } from "./feeCalculator";
import {
  calculateRustFeeBumpAmount,
  calculateRustOuterFee,
  CONGESTION_SCENARIOS,
  deriveMultiplierFromFeeStats,
} from "./feeParity";

describe("fee parity — Node vs Rust base-fee bump", () => {
  const vectors: Array<{
    operationCount: number;
    baseFee: number;
    multiplier: number;
    innerFee?: number;
  }> = [
    { operationCount: 0, baseFee: 100, multiplier: 1.0 },
    { operationCount: 1, baseFee: 100, multiplier: 1.0 },
    { operationCount: 3, baseFee: 100, multiplier: 2.0 },
    { operationCount: 10, baseFee: 100, multiplier: 2.0 },
    { operationCount: 2, baseFee: 100, multiplier: 1.5 },
    { operationCount: 1, baseFee: 100, multiplier: 2.0, innerFee: 500 },
  ];

  for (const v of vectors) {
    it(`matches Rust formula for ${v.operationCount} ops, mult=${v.multiplier}`, () => {
      const nodeFee = calculateFeeBumpFee(
        v.innerFee !== undefined
          ? { operations: Array(v.operationCount).fill({}), fee: String(v.innerFee) }
          : v.operationCount,
        v.baseFee,
        v.multiplier,
      );
      const rustFee = calculateRustFeeBumpAmount(v.operationCount, v.baseFee, v.multiplier);

      if (v.innerFee !== undefined) {
        expect(nodeFee).toBe(Math.max(rustFee, v.innerFee + v.baseFee));
      } else {
        expect(nodeFee).toBe(rustFee);
      }

      const outerFee = calculateRustOuterFee(v.operationCount, v.baseFee, v.multiplier);
      expect(outerFee).toBe(rustFee * (v.operationCount + 1));
    });
  }
});

describe("congestion scenarios — multiplier derivation", () => {
  const baseFee = 100;

  for (const scenario of CONGESTION_SCENARIOS) {
    it(`${scenario.name}: p70=${scenario.p70}, p95=${scenario.p95}`, () => {
      const result = deriveMultiplierFromFeeStats(scenario.p70, scenario.p95, baseFee);
      expect(result.multiplier).toBe(scenario.expectedMultiplier);
      expect(result.congestionLevel).toBe(scenario.expectedCongestion);
    });
  }

  it("applies high multiplier to fee bump under congestion", () => {
    const ops = 2;
    const low = calculateFeeBumpFee(ops, baseFee, 1.0);
    const high = calculateFeeBumpFee(ops, baseFee, 2.0);
    expect(high).toBe(low * 2);
  });
});
