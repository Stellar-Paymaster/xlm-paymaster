import { beforeEach, describe, expect, it, vi } from "vitest";

const horizonMocks = vi.hoisted(() => ({
  servers: new Map<string, any>(),
}));

vi.mock("@stellar/stellar-sdk", () => {
  const Server = vi.fn().mockImplementation((url: string) => {
    const server = horizonMocks.servers.get(url);
    if (!server) {
      throw new Error(`No mocked Horizon server for ${url}`);
    }
    return server;
  });

  return {
    default: {
      Horizon: {
        Server,
      },
    },
  };
});

vi.mock("../services/webhook", () => ({
  WebhookService: class {},
}));

import { HorizonFailoverClient } from "../horizon/failoverClient";
import { LedgerMonitor } from "./ledgerMonitor";

function createMockServer(transactionCall: ReturnType<typeof vi.fn>) {
  return {
    submitTransaction: vi.fn(),
    loadAccount: vi.fn(),
    transactions: vi.fn(() => ({
      transaction: vi.fn(() => ({
        call: transactionCall,
      })),
    })),
    serverInfo: vi.fn().mockResolvedValue({ ledger: 123 }),
  };
}

describe("LedgerMonitor failover integration", () => {
  beforeEach(() => {
    horizonMocks.servers.clear();
    vi.clearAllMocks();
  });

  it("uses the real Horizon failover client to confirm a transaction through a secondary node", async () => {
    const primaryTransactionCall = vi.fn().mockRejectedValue({
      message: "primary timeout",
      response: { status: 504 },
    });
    const secondaryTransactionCall = vi.fn().mockResolvedValue({
      successful: true,
    });

    horizonMocks.servers.set(
      "https://horizon-1.example",
      createMockServer(primaryTransactionCall),
    );
    horizonMocks.servers.set(
      "https://horizon-2.example",
      createMockServer(secondaryTransactionCall),
    );

    const client = new HorizonFailoverClient([
      "https://horizon-1.example",
      "https://horizon-2.example",
    ]);
    const webhookService = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const monitor = new LedgerMonitor(
      {
        horizonSelectionStrategy: "priority",
        horizonUrls: [
          "https://horizon-1.example",
          "https://horizon-2.example",
        ],
        workers: {
          ledgerMonitorConcurrency: 5,
        },
      } as any,
      webhookService as any,
      undefined,
      client,
    );

    await (monitor as any).checkTransaction({
      createdAt: new Date("2026-03-27T12:06:00.000Z"),
      hash: "ledger-hash-1",
      status: "submitted",
      tenantId: "tenant-1",
      updatedAt: new Date("2026-03-27T12:06:00.000Z"),
    });

    expect(primaryTransactionCall).toHaveBeenCalledTimes(1);
    expect(secondaryTransactionCall).toHaveBeenCalledTimes(1);
    expect(webhookService.dispatch).toHaveBeenCalledWith(
      "tenant-1",
      "ledger-hash-1",
      "success",
    );
    expect(client.getNodeStatuses()[0]).toEqual(
      expect.objectContaining({
        url: "https://horizon-1.example",
        state: "Degraded",
        consecutiveFailures: 1,
      }),
    );
  });
});
