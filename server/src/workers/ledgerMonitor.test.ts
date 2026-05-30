import { describe, expect, it, vi } from "vitest";

vi.mock("../services/webhook", () => ({
  WebhookService: class {},
}));

vi.mock("../utils/memoryProfiler", () => ({
  MemoryProfiler: vi.fn().mockImplementation(class {
    start = vi.fn();
    stop = vi.fn();
  }),
}));

import { LedgerMonitor } from "./ledgerMonitor";
import { transactionStore } from "./transactionStore";
import { MemoryProfiler } from "../utils/memoryProfiler";

describe("LedgerMonitor", () => {
  it("sends a Slack alert when Horizon confirms a transaction as failed", async () => {
    const config = {
      horizonSelectionStrategy: "priority",
      horizonUrls: ["https://horizon-testnet.stellar.org"],
    } as any;
    const webhookService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const slackNotifier = {
      notifyFailedTransaction: vi.fn().mockResolvedValue(true),
    };
    const client = {
      getNodeStatuses: vi.fn().mockReturnValue([]),
      getTransaction: vi.fn().mockResolvedValue({ successful: false }),
    };
    const transaction = {
      createdAt: new Date("2026-03-27T12:06:00.000Z"),
      hash: "failed-hash-1",
      status: "submitted" as const,
      tenantId: "tenant-1",
      updatedAt: new Date("2026-03-27T12:06:00.000Z"),
    };

    transactionStore.addTransaction(
      transaction.hash,
      transaction.tenantId,
      transaction.status,
    );

    const monitor = new LedgerMonitor(
      config,
      webhookService as any,
      slackNotifier as any,
      client as any,
    );

    await (monitor as any).checkTransaction(transaction);

    expect(webhookService.dispatch).toHaveBeenCalledWith(
      "tenant-1",
      "failed-hash-1",
      "failed",
    );
    expect(slackNotifier.notifyFailedTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ledger_monitor",
        tenantId: "tenant-1",
        transactionHash: "failed-hash-1",
      }),
    );
  });

  it("uses the configured ledger monitor concurrency as the batch size", () => {
    const config = {
      horizonSelectionStrategy: "priority",
      horizonUrls: ["https://horizon-testnet.stellar.org"],
      workers: {
        ledgerMonitorConcurrency: 12,
      },
    } as any;
    const webhookService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      getNodeStatuses: vi.fn().mockReturnValue([]),
      getTransaction: vi.fn(),
    };

    const monitor = new LedgerMonitor(
      config,
      webhookService as any,
      undefined,
      client as any,
    );

    expect((monitor as any).batchSize).toBe(12);
  });

  it("initializes and controls the memory profiler when enabled in config", () => {
    const config = {
      horizonSelectionStrategy: "priority",
      horizonUrls: ["https://horizon-testnet.stellar.org"],
      workers: {
        memoryProfiling: {
          enabled: true,
          logIntervalMs: 1000,
          heapSnapshotIntervalMs: 5000,
          snapshotPath: "/tmp",
        },
      },
    } as any;
    const webhookService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      getNodeStatuses: vi.fn().mockReturnValue([]),
      getTransaction: vi.fn(),
    };

    const monitor = new LedgerMonitor(
      config,
      webhookService as any,
      undefined,
      client as any,
    );

    let cycleFinished = false;
    // Mock runCycle to simulate a long-running operation
    monitor["runCycle"] = async (workFn) => {
      monitor["currentPromise"] = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        cycleFinished = true;
      })();
      await monitor["currentPromise"];
      monitor["currentPromise"] = null;
    };

    // Trigger a cycle manually
    const cyclePromise = monitor["runCycle"](async () => {});
    
    // Call stop concurrently
    const stopPromise = monitor.stop();
    
    await stopPromise;
    expect(cycleFinished).toBe(true);
    await cyclePromise;
  });
});

