import { describe, expect, it } from "vitest";
import { getTreasuryCriticalBannerState } from "./treasury-critical-banner";

describe("getTreasuryCriticalBannerState", () => {
  it("marks treasury as critical when balance is below threshold", () => {
    const state = getTreasuryCriticalBannerState({
      currentBalanceXlm: 1200,
      runwayDays: 10,
      averageDailySpendXlm: 120,
    });

    expect(state.isCritical).toBe(true);
    expect(state.reasons.some((reason) => reason.includes("Main treasury dropped"))).toBe(true);
  });

  it("marks treasury as critical when runway is too short", () => {
    const state = getTreasuryCriticalBannerState({
      currentBalanceXlm: 7000,
      runwayDays: 2,
      averageDailySpendXlm: 350,
    });

    expect(state.isCritical).toBe(true);
    expect(state.reasons.some((reason) => reason.includes("Estimated runway"))).toBe(true);
  });

  it("marks treasury as critical when signals are invalid", () => {
    const state = getTreasuryCriticalBannerState({
      currentBalanceXlm: Number.NaN,
      runwayDays: null,
      averageDailySpendXlm: 0,
    });

    expect(state.isCritical).toBe(true);
    expect(state.reasons).toContain("Treasury balance signal is invalid or unavailable.");
    expect(state.reasons).toContain("Average daily spend signal is invalid.");
  });

  it("returns stable state for healthy balances and runway", () => {
    const state = getTreasuryCriticalBannerState({
      currentBalanceXlm: 9000,
      runwayDays: 8,
      averageDailySpendXlm: 150,
    });

    expect(state.isCritical).toBe(false);
    expect(state.reasons).toHaveLength(0);
  });
});
