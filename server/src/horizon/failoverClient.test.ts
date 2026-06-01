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

import { HorizonFailoverClient } from "./failoverClient";

function createMockServer(overrides: {
  submitTransaction?: ReturnType<typeof vi.fn>;
  loadAccount?: ReturnType<typeof vi.fn>;
  transactionCall?: ReturnType<typeof vi.fn>;
  serverInfo?: ReturnType<typeof vi.fn>;
} = {}) {
  const transactionCall =
    overrides.transactionCall ?? vi.fn().mockResolvedValue({ successful: true });
  const transactionLookup = vi.fn(() => ({ call: transactionCall }));
  const transactions = vi.fn(() => ({
    transaction: transactionLookup,
  }));

  return {
    submitTransaction:
      overrides.submitTransaction ?? vi.fn().mockResolvedValue({ hash: "tx-hash" }),
    loadAccount:
      overrides.loadAccount ?? vi.fn().mockResolvedValue({ id: "account-id" }),
    transactions,
    transactionCall,
    transactionLookup,
    serverInfo: overrides.serverInfo ?? vi.fn().mockResolvedValue({ ledger: 123 }),
  };
}

describe("HorizonFailoverClient", () => {
  beforeEach(() => {
    horizonMocks.servers.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("fails over on retryable submission errors and degrades the failing node", async () => {
    const primary = createMockServer({
      submitTransaction: vi.fn().mockRejectedValue({
        message: "primary unavailable",
        response: { status: 503 },
      }),
    });
    const secondary = createMockServer({
      submitTransaction: vi.fn().mockResolvedValue({ hash: "secondary-hash" }),
    });

    horizonMocks.servers.set("https://horizon-1.example", primary);
    horizonMocks.servers.set("https://horizon-2.example", secondary);

    const client = new HorizonFailoverClient([
      "https://horizon-1.example",
      "https://horizon-2.example",
    ]);

    const result = await client.submitTransaction({ id: "tx-1" });

    expect(result).toEqual({
      result: { hash: "secondary-hash" },
      nodeUrl: "https://horizon-2.example",
      attempts: 2,
    });
    expect(primary.submitTransaction).toHaveBeenCalledTimes(1);
    expect(secondary.submitTransaction).toHaveBeenCalledTimes(1);

    expect(client.getNodeStatuses()).toEqual([
      expect.objectContaining({
        url: "https://horizon-1.example",
        state: "Degraded",
        consecutiveFailures: 1,
        lastError: "primary unavailable",
        retryAt: expect.any(String),
      }),
      expect.objectContaining({
        url: "https://horizon-2.example",
        state: "Active",
        consecutiveFailures: 0,
      }),
    ]);
  });

  it("does not sideline a node for a non-retryable submission error", async () => {
    const primary = createMockServer({
      submitTransaction: vi.fn().mockRejectedValue({
        message: "tx malformed",
        response: { status: 400 },
      }),
    });
    const secondary = createMockServer();

    horizonMocks.servers.set("https://horizon-1.example", primary);
    horizonMocks.servers.set("https://horizon-2.example", secondary);

    const client = new HorizonFailoverClient([
      "https://horizon-1.example",
      "https://horizon-2.example",
    ]);

    await expect(client.submitTransaction({ id: "tx-2" })).rejects.toMatchObject({
      message: "tx malformed",
    });

    expect(primary.submitTransaction).toHaveBeenCalledTimes(1);
    expect(secondary.submitTransaction).not.toHaveBeenCalled();
    expect(client.getNodeStatuses()[0]).toEqual(
      expect.objectContaining({
        url: "https://horizon-1.example",
        state: "Active",
        consecutiveFailures: 0,
      }),
    );
  });

  it("reactivates a degraded node via an asynchronous recovery probe after cooldown", async () => {
    vi.useFakeTimers();

    const primary = createMockServer({
      submitTransaction: vi.fn().mockRejectedValueOnce({
        message: "temporary outage",
        response: { status: 503 },
      }),
      serverInfo: vi.fn().mockResolvedValue({ ledger: 999 }),
    });
    const secondary = createMockServer({
      submitTransaction: vi.fn().mockResolvedValue({ hash: "secondary-hash" }),
      loadAccount: vi.fn().mockResolvedValue({ id: "secondary-account" }),
    });

    horizonMocks.servers.set("https://horizon-1.example", primary);
    horizonMocks.servers.set("https://horizon-2.example", secondary);

    const client = new HorizonFailoverClient([
      "https://horizon-1.example",
      "https://horizon-2.example",
    ]);

    await client.submitTransaction({ id: "tx-3" });
    expect(client.getNodeStatuses()[0]?.state).toBe("Degraded");

    await vi.advanceTimersByTimeAsync(61_000);
    await client.loadAccount("GRECOVER");
    await Promise.resolve();
    await Promise.resolve();

    expect(primary.serverInfo).toHaveBeenCalledTimes(1);
    expect(client.getNodeStatuses()[0]).toEqual(
      expect.objectContaining({
        url: "https://horizon-1.example",
        state: "Active",
        consecutiveFailures: 0,
        lastProbeAt: expect.any(String),
      }),
    );
  });

  it("surfaces 404 account lookups without degrading the node", async () => {
    const primary = createMockServer({
      loadAccount: vi.fn().mockRejectedValue({
        message: "404 not found",
        response: { status: 404 },
      }),
    });

    horizonMocks.servers.set("https://horizon-1.example", primary);

    const client = new HorizonFailoverClient([
      "https://horizon-1.example",
    ]);

    await expect(client.loadAccount("GMISSING")).rejects.toMatchObject({
      message: "404 not found",
    });

    expect(client.getNodeStatuses()[0]).toEqual(
      expect.objectContaining({
        url: "https://horizon-1.example",
        state: "Active",
        consecutiveFailures: 0,
      }),
    );
  });
});
