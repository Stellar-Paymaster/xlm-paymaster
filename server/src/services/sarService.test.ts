import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluateSARRules } from "./sarService";
import { prisma } from "../utils/db";

vi.mock("../utils/db", () => ({
  prisma: {
    transaction: {
      count: vi.fn()
    },
    sARReport: {
      upsert: vi.fn()
    }
  }
}));

// Use default rules from the JSON file
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SAR_RULES_PATH;
});

describe("evaluateSARRules — HIGH_FREQUENCY", () => {
  it("creates SAR report when tx count exceeds threshold", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(55);
    (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await evaluateSARRules("tx-1", "tenant-1", 1000, "Token Transfer");

    expect(prisma.sARReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ ruleCode: "HIGH_FREQUENCY" })
      })
    );
  });

  it("does not create SAR report when tx count is below threshold", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(30);

    await evaluateSARRules("tx-2", "tenant-1", 1000, "Token Transfer");

    // HIGH_FREQUENCY should not trigger; no upsert for it
    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const hfCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "HIGH_FREQUENCY");
    expect(hfCalls).toHaveLength(0);
  });
});

describe("evaluateSARRules — HIGH_SOROBAN_FEE", () => {
  it("creates SAR report for Soroban tx with high fee", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await evaluateSARRules("tx-3", "tenant-1", 150_000, "Soroban Contract");

    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const sorobanCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "HIGH_SOROBAN_FEE");
    expect(sorobanCalls).toHaveLength(1);
    expect(sorobanCalls[0][0].create.reason).toContain("150000 stroops");
  });

  it("does not create SAR report for non-Soroban tx even with high fee", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await evaluateSARRules("tx-4", "tenant-1", 150_000, "Token Transfer");

    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const sorobanCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "HIGH_SOROBAN_FEE");
    expect(sorobanCalls).toHaveLength(0);
  });

  it("does not flag Soroban tx with fee below threshold", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await evaluateSARRules("tx-5", "tenant-1", 50_000, "Soroban Contract");

    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const sorobanCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "HIGH_SOROBAN_FEE");
    expect(sorobanCalls).toHaveLength(0);
  });
});

describe("evaluateSARRules — LARGE_FEE_BUMP", () => {
  it("creates SAR report when fee exceeds 1,000,000 stroops", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await evaluateSARRules("tx-6", "tenant-1", 1_500_000, "Other");

    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const largeCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "LARGE_FEE_BUMP");
    expect(largeCalls).toHaveLength(1);
    expect(largeCalls[0][0].create.reason).toContain("1500000 stroops");
  });

  it("does not flag fee below threshold", async () => {
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await evaluateSARRules("tx-7", "tenant-1", 500_000, "Other");

    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const largeCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "LARGE_FEE_BUMP");
    expect(largeCalls).toHaveLength(0);
  });
});

describe("evaluateSARRules — multiple rules can trigger simultaneously", () => {
  it("creates multiple SAR reports when multiple rules match", async () => {
    // High frequency + large fee + high soroban fee all trigger
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(60);
    (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await evaluateSARRules("tx-8", "tenant-1", 2_000_000, "Soroban Contract");

    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    expect(upsertCalls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("evaluateSARRules — error resilience", () => {
  it("continues evaluating remaining rules when one throws", async () => {
    // Make count throw (HIGH_FREQUENCY will fail), but LARGE_FEE_BUMP should still run
    (prisma.transaction.count as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB timeout"));
    (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Should not throw
    await expect(
      evaluateSARRules("tx-9", "tenant-1", 2_000_000, "Other")
    ).resolves.not.toThrow();

    // LARGE_FEE_BUMP and HIGH_SOROBAN_FEE don't use transaction.count, so LARGE_FEE_BUMP fires
    const upsertCalls = (prisma.sARReport.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const largeCalls = upsertCalls.filter((c: any) => c[0].create?.ruleCode === "LARGE_FEE_BUMP");
    expect(largeCalls).toHaveLength(1);
  });
});
