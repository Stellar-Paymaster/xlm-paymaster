import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/transactionLedger", () => ({
  getTenantMonthSponsoredTotals: vi.fn(),
  getTenantDailySpendStroops: vi.fn(),
  getTenantDailyTransactionCount: vi.fn(),
  getTenantSponsoredDailySeries: vi.fn(),
}));

vi.mock("../utils/db", () => ({
  default: {
    apiKey: {
      findUnique: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "../utils/db";
import {
  getTenantDailySpendStroops,
  getTenantDailyTransactionCount,
  getTenantMonthSponsoredTotals,
  getTenantSponsoredDailySeries,
} from "../models/transactionLedger";
import type { ApiKeyConfig } from "../middleware/apiKeys";
import {
  getTenantUsageChartHandler,
  getTenantUsageSummaryHandler,
  getTenantUsageTransactionsHandler,
} from "./tenantUsage";

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

function sampleApiKeyConfig(overrides: Partial<ApiKeyConfig> = {}): ApiKeyConfig {
  return {
    key: "fluid_test_key_xxxxxxxx",
    tenantId: "tenant-a",
    name: "Primary",
    tier: "free",
    tierName: "Free",
    tierId: "tier-free",
    txLimit: 100,
    rateLimit: 60,
    priceMonthly: 0,
    maxRequests: 60,
    windowMs: 60_000,
    dailyQuotaStroops: 1_000_000,
    isSandbox: false,
    allowedChains: ["stellar"],
    ...overrides,
  };
}

describe("tenant usage handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summary sets quotaWarning when daily stroops usage crosses 80%", async () => {
    vi.mocked(getTenantMonthSponsoredTotals).mockResolvedValue({
      txCount: 5,
      feeStroops: 50_000,
    });
    vi.mocked(getTenantDailySpendStroops).mockResolvedValue(800_000);
    vi.mocked(getTenantDailyTransactionCount).mockResolvedValue(1);
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      name: "Primary",
      lastUsedAt: new Date("2026-03-29T12:00:00.000Z"),
    } as any);

    const req = {} as any;
    const res = makeRes();
    res.locals = { apiKey: sampleApiKeyConfig({ dailyQuotaStroops: 1_000_000 }) };

    await getTenantUsageSummaryHandler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.quotaWarning).toBe(true);
    expect(payload.day.remainingStroops).toBe(200_000);
    expect(payload.month.txCount).toBe(5);
    expect(payload.month.xlmSponsored).toBeCloseTo(50_000 / 10_000_000);
  });

  it("summary sets quotaWarning when daily tx count crosses 80%", async () => {
    vi.mocked(getTenantMonthSponsoredTotals).mockResolvedValue({
      txCount: 0,
      feeStroops: 0,
    });
    vi.mocked(getTenantDailySpendStroops).mockResolvedValue(0);
    vi.mocked(getTenantDailyTransactionCount).mockResolvedValue(85);
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      name: "Primary",
      lastUsedAt: null,
    } as any);

    const req = {} as any;
    const res = makeRes();
    res.locals = { apiKey: sampleApiKeyConfig({ txLimit: 100 }) };

    await getTenantUsageSummaryHandler(req, res);

    expect(res.json.mock.calls[0][0].quotaWarning).toBe(true);
    expect(res.json.mock.calls[0][0].day.remainingTx).toBe(15);
  });

  it("summary returns 401-shaped payload when api key context missing", async () => {
    const req = {} as any;
    const res = makeRes();
    res.locals = {};

    await getTenantUsageSummaryHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("chart loads series for the tenant from api key context", async () => {
    vi.mocked(getTenantSponsoredDailySeries).mockResolvedValue([
      { date: "2026-03-28", txCount: 2, feeStroops: 200 },
    ]);

    const req = { query: { days: "30" } } as any;
    const res = makeRes();
    res.locals = { apiKey: sampleApiKeyConfig() };

    await getTenantUsageChartHandler(req, res);

    expect(getTenantSponsoredDailySeries).toHaveBeenCalledWith(
      "tenant-a",
      30,
      expect.any(Date)
    );
    expect(res.json.mock.calls[0][0].series).toHaveLength(1);
  });

  it("transactions caps limit at 100 and scopes by tenantId", async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);

    const req = { query: { limit: "500" } } as any;
    const res = makeRes();
    res.locals = { apiKey: sampleApiKeyConfig({ tenantId: "tenant-x" }) };

    await getTenantUsageTransactionsHandler(req, res);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-x" },
        take: 100,
      })
    );
  });
});
