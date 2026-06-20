import "server-only";

import type { SpendForecastData } from "@/components/dashboard/types";

function buildSampleData(): SpendForecastData {
  const today = new Date();
  const spendSeries: Array<{ date: string; spendXlm: number }> = [];
  const historicalBalance: Array<{ date: string; balanceXlm: number }> = [];
  const projectedBalance: Array<{ date: string; balanceXlm: number }> = [];

  const baseSpend = [
    420, 380, 510, 470, 390, 620, 580, 445, 490, 530,
    710, 680, 920, 870, 1050, 990, 760, 640, 580, 500,
    430, 610, 570, 490, 520, 480, 610, 590, 540, 470,
  ];

  let rollingBalance = 18_500;
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - i);

    const day = date.toISOString().split("T")[0];
    const spendXlm = baseSpend[29 - i] / 10;
    spendSeries.push({ date: day, spendXlm });

    rollingBalance -= spendXlm;
    historicalBalance.push({ date: day, balanceXlm: Math.max(rollingBalance, 0) });
  }

  let projected = historicalBalance[historicalBalance.length - 1]?.balanceXlm ?? 0;
  for (let day = 0; day <= 30; day += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + day);

    if (day > 0) {
      projected = Math.max(0, projected - 55);
    }

    projectedBalance.push({
      date: date.toISOString().split("T")[0],
      balanceXlm: projected,
    });

    if (projected <= 0) {
      break;
    }
  }

  const runwayDays = projectedBalance.length - 1;

  return {
    alert: runwayDays < 7,
    averageDailySpendXlm: 55,
    currentBalanceXlm: historicalBalance[historicalBalance.length - 1]?.balanceXlm ?? 0,
    historicalBalance,
    projectedBalance,
    runwayDays,
    runwayMessage: `At current spend rate, balance lasts ~${runwayDays} days`,
    source: "sample",
    spendSeries,
  };
}

export async function getSpendForecastData(): Promise<SpendForecastData> {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "") ?? "";
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim() ?? "";

  if (!serverUrl || !adminToken) {
    return buildSampleData();
  }

  try {
    const response = await fetch(`${serverUrl}/admin/analytics/spend-forecast`, {
      cache: "no-store",
      headers: { "x-admin-token": adminToken },
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const payload = (await response.json()) as Omit<SpendForecastData, "source">;
    return {
      ...payload,
      source: "live",
    };
  } catch {
    return buildSampleData();
  }
}
