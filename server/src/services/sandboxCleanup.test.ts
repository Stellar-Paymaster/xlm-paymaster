import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateSandboxCutoff,
  getSandboxTenantIds,
  purgeSandboxTenantData,
  purgeStaleSandboxTransactionData,
} from "./sandboxCleanup";

vi.mock("../utils/db", () => ({
  default: {
    apiKey: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sponsoredTransaction: {
      deleteMany: vi.fn(),
    },
    webhookDelivery: {
      deleteMany: vi.fn(),
    },
  },
}));

import prisma from "../utils/db";

const mockPrisma = prisma as any;

describe("sandboxCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateSandboxCutoff", () => {
    it("subtracts retention days from the reference date", () => {
      const now = new Date("2026-06-01T12:00:00.000Z");
      const cutoff = calculateSandboxCutoff(7, now);
      expect(cutoff.toISOString()).toBe("2026-05-25T12:00:00.000Z");
    });

    it("handles zero retention as same-day cutoff", () => {
      const now = new Date("2026-06-01T00:00:00.000Z");
      const cutoff = calculateSandboxCutoff(0, now);
      expect(cutoff.toISOString()).toBe(now.toISOString());
    });
  });

  describe("getSandboxTenantIds", () => {
    it("returns unique tenant IDs for active sandbox keys", async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([
        { tenantId: "tenant-a" },
        { tenantId: "tenant-b" },
        { tenantId: "tenant-a" },
      ]);

      await expect(getSandboxTenantIds()).resolves.toEqual([
        "tenant-a",
        "tenant-b",
      ]);
    });

    it("returns empty array when no sandbox keys exist", async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([]);
      await expect(getSandboxTenantIds()).resolves.toEqual([]);
    });
  });

  describe("purgeSandboxTenantData", () => {
    it("deletes all sandbox records for a tenant", async () => {
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.sponsoredTransaction.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.webhookDelivery.deleteMany.mockResolvedValue({ count: 1 });

      const result = await purgeSandboxTenantData("tenant-1");

      expect(result).toEqual({
        transactionsDeleted: 5,
        sponsoredDeleted: 2,
        webhookDeliveriesDeleted: 1,
      });
      expect(mockPrisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
      });
    });
  });

  describe("purgeStaleSandboxTransactionData", () => {
    it("returns SUCCESS with zero counts when no sandbox tenants exist", async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([]);

      const report = await purgeStaleSandboxTransactionData({
        now: new Date("2026-06-01T00:00:00.000Z"),
      });

      expect(report.status).toBe("SUCCESS");
      expect(report.transactionsDeleted).toBe(0);
      expect(report.sandboxTenantCount).toBe(0);
    });

    it("purges stale records for sandbox tenants in batches", async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([{ tenantId: "tenant-sbx" }]);
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ id: "tx-1" }, { id: "tx-2" }])
        .mockResolvedValueOnce([]);
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.sponsoredTransaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.webhookDelivery.deleteMany.mockResolvedValue({ count: 3 });

      const report = await purgeStaleSandboxTransactionData({
        retentionDays: 7,
        batchSize: 500,
        now: new Date("2026-06-01T00:00:00.000Z"),
      });

      expect(report.status).toBe("SUCCESS");
      expect(report.transactionsDeleted).toBe(2);
      expect(report.sponsoredTransactionsDeleted).toBe(1);
      expect(report.webhookDeliveriesDeleted).toBe(3);
      expect(report.retentionDays).toBe(7);
    });

    it("returns FAILED when prisma throws", async () => {
      mockPrisma.apiKey.findMany.mockRejectedValue(new Error("DB unavailable"));

      const report = await purgeStaleSandboxTransactionData({
        now: new Date("2026-06-01T00:00:00.000Z"),
      });

      expect(report.status).toBe("FAILED");
      expect(report.error).toMatch(/DB unavailable/);
    });

    it("stops batch loop when no more rows match cutoff", async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([{ tenantId: "tenant-sbx" }]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.sponsoredTransaction.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.webhookDelivery.deleteMany.mockResolvedValue({ count: 0 });

      const report = await purgeStaleSandboxTransactionData({
        retentionDays: 30,
        now: new Date("2026-06-01T00:00:00.000Z"),
      });

      expect(report.transactionsDeleted).toBe(0);
      expect(mockPrisma.transaction.deleteMany).not.toHaveBeenCalled();
    });
  });
});
