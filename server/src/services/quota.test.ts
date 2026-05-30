import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkTenantDailyQuota } from "./quota";
import type { Tenant } from "../models/tenantStore";

vi.mock("../models/transactionLedger", () => ({
  getTenantDailySpendStroops: vi.fn(),
  getTenantDailyTransactionCount: vi.fn(),
}));

import {
  getTenantDailySpendStroops,
  getTenantDailyTransactionCount,
} from "../models/transactionLedger";

const mockedSpend = vi.mocked(getTenantDailySpendStroops);
const mockedCount = vi.mocked(getTenantDailyTransactionCount);

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-free",
    apiKey: "free-key",
    name: "Free Tenant",
    tier: "free",
    tierName: "Free",
    txLimit: 10,
    rateLimit: 5,
    priceMonthly: 0,
    dailyQuotaStroops: 1_000_000,
    ...overrides,
  };
}

describe("checkTenantDailyQuota", () => {
  beforeEach(() => {
    mockedSpend.mockReset();
    mockedCount.mockReset();
  });

  it("blocks the next transaction when the tenant has already hit the tier tx limit", async () => {
    mockedSpend.mockResolvedValue(50_000);
    mockedCount.mockResolvedValue(10);

    const result = await checkTenantDailyQuota(buildTenant(), 1000);

    expect(result.allowed).toBe(false);
    expect(result.currentTxCount).toBe(10);
    expect(result.projectedTxCount).toBe(11);
    expect(result.txLimit).toBe(10);
  });

  it("allows a higher-tier tenant to continue below both spend and tx limits", async () => {
    mockedSpend.mockResolvedValue(200_000);
    mockedCount.mockResolvedValue(120);

    const result = await checkTenantDailyQuota(
      buildTenant({
        tier: "pro",
        tierName: "Pro",
        txLimit: 1000,
        rateLimit: 60,
        priceMonthly: 4900,
      }),
      5_000,
    );

    expect(result.allowed).toBe(true);
    expect(result.projectedTxCount).toBe(121);
    expect(result.projectedSpendStroops).toBe(205_000);
  });

  it("accounts for multiple transactions in a batch quota check", async () => {
    mockedSpend.mockResolvedValue(800_000);
    mockedCount.mockResolvedValue(8);

    const result = await checkTenantDailyQuota(buildTenant(), 50_000, 3);

    expect(result.allowed).toBe(false);
    expect(result.currentTxCount).toBe(8);
    expect(result.projectedTxCount).toBe(11);
    expect(result.txLimit).toBe(10);
  });
});
