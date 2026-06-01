import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/db", () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
    },
    apiKey: {
      findMany: vi.fn(),
    },
    webhookDelivery: {
      findMany: vi.fn(),
    },
    sponsoredTransaction: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    quotaTopUp: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "../utils/db";
import {
  getTenantTransactions,
  getTenantApiKeys,
  getTenantWebhookDeliveries,
  getTenantDailySpend,
  getTenantById,
  getTenantQuotaTopUps,
} from "./tenantIsolationService";

const db = prisma as any;

const TENANT_ID = "tenant-abc-123";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTenantTransactions", () => {
  it("queries with the correct tenantId predicate", async () => {
    db.transaction.findMany.mockResolvedValue([]);
    await getTenantTransactions({ tenantId: TENANT_ID });
    expect(db.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } })
    );
  });

  it("passes limit and offset through to Prisma", async () => {
    db.transaction.findMany.mockResolvedValue([]);
    await getTenantTransactions({ tenantId: TENANT_ID }, { limit: 10, offset: 5 });
    expect(db.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 5 })
    );
  });

  it("returns the rows from Prisma", async () => {
    const rows = [{ id: "t1" }, { id: "t2" }];
    db.transaction.findMany.mockResolvedValue(rows);
    const result = await getTenantTransactions({ tenantId: TENANT_ID });
    expect(result).toEqual(rows);
  });
});

describe("getTenantApiKeys", () => {
  it("queries with the correct tenantId predicate", async () => {
    db.apiKey.findMany.mockResolvedValue([]);
    await getTenantApiKeys({ tenantId: TENANT_ID });
    expect(db.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } })
    );
  });
});

describe("getTenantWebhookDeliveries", () => {
  it("scopes to tenantId and respects limit", async () => {
    db.webhookDelivery.findMany.mockResolvedValue([]);
    await getTenantWebhookDeliveries({ tenantId: TENANT_ID }, { limit: 20 });
    expect(db.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID }, take: 20 })
    );
  });
});

describe("getTenantDailySpend", () => {
  it("sums feeStroops for the tenant", async () => {
    db.sponsoredTransaction.findMany.mockResolvedValue([
      { feeStroops: 100n },
      { feeStroops: 250n },
    ]);
    const total = await getTenantDailySpend({ tenantId: TENANT_ID });
    expect(total).toBe(350n);
  });

  it("returns 0n when there are no sponsored transactions", async () => {
    db.sponsoredTransaction.findMany.mockResolvedValue([]);
    const total = await getTenantDailySpend({ tenantId: TENANT_ID });
    expect(total).toBe(0n);
  });

  it("scopes the query to tenantId", async () => {
    db.sponsoredTransaction.findMany.mockResolvedValue([]);
    await getTenantDailySpend({ tenantId: TENANT_ID });
    const call = db.sponsoredTransaction.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT_ID);
  });
});

describe("getTenantById", () => {
  it("returns the tenant when found", async () => {
    const tenant = { id: TENANT_ID, name: "Acme", subscriptionTier: {} };
    db.tenant.findUnique.mockResolvedValue(tenant);
    const result = await getTenantById(TENANT_ID);
    expect(result).toEqual(tenant);
  });

  it("throws when the tenant is not found", async () => {
    db.tenant.findUnique.mockResolvedValue(null);
    await expect(getTenantById("ghost-id")).rejects.toThrow(
      "Tenant not found: ghost-id"
    );
  });
});

describe("getTenantQuotaTopUps", () => {
  it("scopes to tenantId", async () => {
    db.quotaTopUp.findMany.mockResolvedValue([]);
    await getTenantQuotaTopUps({ tenantId: TENANT_ID });
    expect(db.quotaTopUp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } })
    );
  });
});
