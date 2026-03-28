import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getYesterdayUtcRange,
  aggregateYesterdayStats,
} from "./digestAggregator";

// ── Mock prisma ──────────────────────────────────────────────────────────────
vi.mock("../utils/db", () => ({
  default: {
    sponsoredTransaction: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import prisma from "../utils/db";

const mockPrisma = prisma as unknown as {
  sponsoredTransaction: {
    aggregate: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getYesterdayUtcRange", () => {
  it("returns a 24-hour UTC range ending at midnight of the given date", () => {
    const now = new Date("2025-06-15T10:30:00Z");
    const { start, end } = getYesterdayUtcRange(now);

    expect(start.toISOString()).toBe("2025-06-14T00:00:00.000Z");
    expect(end.toISOString()).toBe("2025-06-15T00:00:00.000Z");
  });

  it("handles month boundaries correctly", () => {
    const now = new Date("2025-03-01T00:00:00Z");
    const { start, end } = getYesterdayUtcRange(now);

    expect(start.toISOString()).toBe("2025-02-28T00:00:00.000Z");
    expect(end.toISOString()).toBe("2025-03-01T00:00:00.000Z");
  });

  it("handles year boundaries correctly", () => {
    const now = new Date("2025-01-01T12:00:00Z");
    const { start, end } = getYesterdayUtcRange(now);

    expect(start.toISOString()).toBe("2024-12-31T00:00:00.000Z");
    expect(end.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("aggregateYesterdayStats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns zero stats when no transactions exist", async () => {
    mockPrisma.sponsoredTransaction.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { feeStroops: null },
    });

    const now = new Date("2025-06-15T09:00:00Z");
    const stats = await aggregateYesterdayStats(now);

    expect(stats.date).toBe("2025-06-14");
    expect(stats.totalTransactions).toBe(0);
    expect(stats.totalXlmSpent).toBe(0);
    expect(stats.topTenant).toBeNull();
    expect(stats.alertsTriggered).toEqual([]);
  });

  it("converts feeStroops to XLM correctly", async () => {
    // 10_000_000 stroops = 1 XLM
    mockPrisma.sponsoredTransaction.aggregate.mockResolvedValue({
      _count: { id: 5 },
      _sum: { feeStroops: BigInt(25_000_000) },
    });
    mockPrisma.sponsoredTransaction.groupBy.mockResolvedValue([
      {
        tenantId: "tenant-abc",
        _count: { id: 5 },
        _sum: { feeStroops: BigInt(25_000_000) },
      },
    ]);

    const now = new Date("2025-06-15T09:00:00Z");
    const stats = await aggregateYesterdayStats(now);

    expect(stats.totalTransactions).toBe(5);
    expect(stats.totalXlmSpent).toBeCloseTo(2.5, 5);
    expect(stats.topTenant).not.toBeNull();
    expect(stats.topTenant?.tenantId).toBe("tenant-abc");
    expect(stats.topTenant?.transactionCount).toBe(5);
  });

  it("queries with the correct UTC date range", async () => {
    mockPrisma.sponsoredTransaction.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { feeStroops: null },
    });

    const now = new Date("2025-08-20T23:59:00Z");
    await aggregateYesterdayStats(now);

    const [callArgs] = mockPrisma.sponsoredTransaction.aggregate.mock.calls;
    expect(callArgs[0].where.createdAt.gte.toISOString()).toBe(
      "2025-08-19T00:00:00.000Z",
    );
    expect(callArgs[0].where.createdAt.lt.toISOString()).toBe(
      "2025-08-20T00:00:00.000Z",
    );
  });

  it("passes through provided alertsTriggered", async () => {
    mockPrisma.sponsoredTransaction.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { feeStroops: null },
    });

    const alerts = ["Low balance on GFAKE", "5xx spike detected"];
    const stats = await aggregateYesterdayStats(new Date(), alerts);

    expect(stats.alertsTriggered).toEqual(alerts);
  });

  it("picks the top tenant with highest transaction count", async () => {
    mockPrisma.sponsoredTransaction.aggregate.mockResolvedValue({
      _count: { id: 10 },
      _sum: { feeStroops: BigInt(50_000_000) },
    });
    mockPrisma.sponsoredTransaction.groupBy.mockResolvedValue([
      {
        tenantId: "top-tenant",
        _count: { id: 8 },
        _sum: { feeStroops: BigInt(40_000_000) },
      },
    ]);

    const stats = await aggregateYesterdayStats(new Date());

    expect(stats.topTenant?.tenantId).toBe("top-tenant");
    expect(stats.topTenant?.transactionCount).toBe(8);
  });
});
