import type { SpendForecastData } from "@/components/dashboard/types";

export interface TreasuryCriticalBannerState {
  isCritical: boolean;
  title: string;
  summary: string;
  reasons: string[];
}

export interface TreasuryCriticalThresholds {
  minBalanceXlm: number;
  minRunwayDays: number;
}

const DEFAULT_THRESHOLDS: TreasuryCriticalThresholds = {
  minBalanceXlm: 1500,
  minRunwayDays: 3,
};

function isInvalidNumber(value: number | null | undefined): boolean {
  if (typeof value !== "number") return true;
  return !Number.isFinite(value);
}

export function getTreasuryCriticalBannerState(
  forecast: Pick<SpendForecastData, "currentBalanceXlm" | "runwayDays" | "averageDailySpendXlm">,
  thresholds: TreasuryCriticalThresholds = DEFAULT_THRESHOLDS,
): TreasuryCriticalBannerState {
  const reasons: string[] = [];

  if (isInvalidNumber(forecast.currentBalanceXlm) || forecast.currentBalanceXlm < 0) {
    reasons.push("Treasury balance signal is invalid or unavailable.");
  } else if (forecast.currentBalanceXlm <= thresholds.minBalanceXlm) {
    reasons.push(
      `Main treasury dropped to ${forecast.currentBalanceXlm.toFixed(2)} XLM (threshold: ${thresholds.minBalanceXlm} XLM).`,
    );
  }

  if (isInvalidNumber(forecast.averageDailySpendXlm) || forecast.averageDailySpendXlm <= 0) {
    reasons.push("Average daily spend signal is invalid.");
  }

  if (forecast.runwayDays !== null) {
    if (isInvalidNumber(forecast.runwayDays) || forecast.runwayDays < 0) {
      reasons.push("Runway estimate is invalid.");
    } else if (forecast.runwayDays <= thresholds.minRunwayDays) {
      reasons.push(
        `Estimated runway is ${forecast.runwayDays} day${forecast.runwayDays === 1 ? "" : "s"} (threshold: ${thresholds.minRunwayDays} days).`,
      );
    }
  }

  if (reasons.length > 0) {
    return {
      isCritical: true,
      title: "Critical: Low Main Treasury Funds",
      summary: "Top up treasury immediately to avoid transaction failures and signer pool disruption.",
      reasons,
    };
  }

  return {
    isCritical: false,
    title: "Treasury Stable",
    summary: "Main treasury balance and runway are above critical thresholds.",
    reasons: [],
  };
}
