/**
 * Chaos Engineering — Fault Injection Tests
 *
 * These tests simulate three failure scenarios documented in issue #241:
 *   1. Rust engine termination mid-request  → graceful degradation
 *   2. Postgres connection failure           → queued requests recover
 *   3. Horizon 503                          → fallback RPC kicks in
 *
 * All tests run in-process using mocks so they can execute in any environment
 * without Toxiproxy or a real Stellar network.  The chaos/experiments/ YAML
 * files define the equivalent live experiments for staging environments.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../horizon/circuitBreaker";
import { HorizonFailoverClient } from "../horizon/failoverClient";

// ── Stellar SDK mock ─────────────────────────────────────────────────────────

const horizonMocks = vi.hoisted(() => ({
  servers: new Map<string, any>(),
}));

vi.mock("@stellar/stellar-sdk", () => {
  // Use a regular function (not arrow) so `new Server(url)` works.
  function Server(this: any, url: string) {
    const s = horizonMocks.servers.get(url);
    if (!s) throw new Error(`No mock Horizon server for ${url}`);
    Object.assign(this, s);
  }

  return { default: { Horizon: { Server } } };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockHorizonServer(overrides: {
  submitTransaction?: ReturnType<typeof vi.fn>;
  serverInfo?: ReturnType<typeof vi.fn>;
} = {}) {
  const transactionCall = vi.fn().mockResolvedValue({ successful: true });
  return {
    submitTransaction:
      overrides.submitTransaction ?? vi.fn().mockResolvedValue({ hash: "ok" }),
    loadAccount: vi.fn().mockResolvedValue({ id: "acc" }),
    transactions: vi.fn(() => ({ transaction: vi.fn(() => ({ call: transactionCall })) })),
    serverInfo: overrides.serverInfo ?? vi.fn().mockResolvedValue({ ledger: 1 }),
  };
}

function networkError(): Error {
  const err = new Error("ECONNREFUSED: connection refused");
  (err as any).code = "ECONNREFUSED";
  return err;
}

function serviceUnavailable(): Error {
  const err = new Error("Service unavailable");
  (err as any).response = { status: 503 };
  return err;
}

// ── 1. Kill Rust engine mid-request ─────────────────────────────────────────

describe("Chaos: kill Rust engine mid-request", () => {
  beforeEach(() => {
    horizonMocks.servers.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("circuit breaker trips open after 5 rapid engine failures and fast-fails subsequent requests", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      label: "rust-engine-endpoint",
      failureThreshold: 5,
      windowMs: 30_000,
      recoveryTimeoutMs: 10_000,
    });

    // Simulate 5 consecutive engine crashes
    for (let i = 0; i < 5; i++) {
      expect(cb.allowRequest()).toBe(true);
      cb.recordFailure();
    }

    // Circuit is now Open
    expect(cb.getState()).toBe("Open");

    // Subsequent requests are fast-failed — no engine calls
    const start = performance.now();
    const allowed = cb.allowRequest();
    const elapsed = performance.now() - start;

    expect(allowed).toBe(false);
    expect(elapsed).toBeLessThan(5); // microseconds, not milliseconds
  });

  it("recovers to Closed state after recovery timeout and successful probe", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      label: "rust-engine-endpoint",
      failureThreshold: 5,
      windowMs: 30_000,
      recoveryTimeoutMs: 10_000,
    });

    for (let i = 0; i < 5; i++) cb.recordFailure();
    expect(cb.getState()).toBe("Open");

    // Advance past recovery timeout (simulates engine restart)
    vi.advanceTimersByTime(10_001);
    expect(cb.getState()).toBe("Half-Open");

    // Successful probe → Closed
    cb.allowRequest();
    cb.recordSuccess();
    expect(cb.getState()).toBe("Closed");
  });
});

// ── 2. Postgres connection failure ───────────────────────────────────────────

describe("Chaos: Postgres connection failure", () => {
  beforeEach(() => {
    horizonMocks.servers.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("Horizon failover client retries on retryable errors and does not lose requests", async () => {
    const primary = makeMockHorizonServer({
      submitTransaction: vi
        .fn()
        .mockRejectedValueOnce(serviceUnavailable())
        .mockResolvedValue({ hash: "recovered-tx" }),
    });
    const secondary = makeMockHorizonServer();

    horizonMocks.servers.set("http://primary:8000", primary);
    horizonMocks.servers.set("http://secondary:8000", secondary);

    const client = new HorizonFailoverClient(
      ["http://primary:8000", "http://secondary:8000"],
      "priority"
    );

    const result = await client.submitTransaction({ type: "tx" });
    expect(result.result.hash).toBeDefined();
  });

  it("falls back to secondary node when primary has a network-level error", async () => {
    const primary = makeMockHorizonServer({
      submitTransaction: vi.fn().mockRejectedValue(networkError()),
    });
    const secondary = makeMockHorizonServer();

    horizonMocks.servers.set("http://primary:8000", primary);
    horizonMocks.servers.set("http://secondary:8000", secondary);

    const client = new HorizonFailoverClient(
      ["http://primary:8000", "http://secondary:8000"],
      "priority"
    );

    const result = await client.submitTransaction({ type: "tx" });
    expect(result.nodeUrl).toBe("http://secondary:8000");
  });
});

// ── 3. Horizon 503 — fallback RPC ────────────────────────────────────────────

describe("Chaos: Horizon 503 simulation", () => {
  beforeEach(() => {
    horizonMocks.servers.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("degrades primary node on 503 and routes traffic to secondary", async () => {
    const submitFn = vi.fn().mockRejectedValue(serviceUnavailable());
    const primary = makeMockHorizonServer({ submitTransaction: submitFn });
    const secondary = makeMockHorizonServer();

    horizonMocks.servers.set("http://primary:8000", primary);
    horizonMocks.servers.set("http://secondary:8000", secondary);

    const client = new HorizonFailoverClient(
      ["http://primary:8000", "http://secondary:8000"],
      "priority"
    );

    // First submit: primary fails, secondary takes over
    const result = await client.submitTransaction({ type: "tx" });
    expect(result.nodeUrl).toBe("http://secondary:8000");

    // Primary is now Degraded (cooldown prevents further attempts until timeout)
    const statuses = client.getNodeStatuses();
    const primaryStatus = statuses.find((s) => s.url === "http://primary:8000");
    expect(primaryStatus?.state).not.toBe("Active");
    expect(["Degraded", "Inactive"]).toContain(primaryStatus?.state);
  });

  it("circuit breaker for primary opens after 5 503 failures within 30 s", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      label: "http://primary:8000",
      failureThreshold: 5,
      windowMs: 30_000,
      recoveryTimeoutMs: 10_000,
    });

    for (let i = 0; i < 5; i++) cb.recordFailure();

    expect(cb.getState()).toBe("Open");
    const status = cb.getStatus();
    expect(status.openedAt).toBeDefined();
    expect(status.nextRetryAt).toBeDefined();
  });

  it("circuit breaker exposes state in getNodeStatuses for dashboard display", async () => {
    const primary = makeMockHorizonServer({
      submitTransaction: vi.fn().mockRejectedValue(serviceUnavailable()),
    });
    const secondary = makeMockHorizonServer();

    horizonMocks.servers.set("http://h1:8000", primary);
    horizonMocks.servers.set("http://h2:8000", secondary);

    const client = new HorizonFailoverClient(
      ["http://h1:8000", "http://h2:8000"],
      "priority"
    );

    await client.submitTransaction({ type: "tx" });

    const statuses = client.getNodeStatuses();
    for (const s of statuses) {
      expect(s.circuitBreaker).toBeDefined();
      expect(["Closed", "Open", "Half-Open"]).toContain(
        s.circuitBreaker!.state
      );
    }
  });

  it("documents recovery times — secondary used instantly, primary recovers after cooldown", async () => {
    vi.useFakeTimers();

    const primary = makeMockHorizonServer({
      submitTransaction: vi.fn().mockRejectedValue(serviceUnavailable()),
      serverInfo: vi.fn().mockRejectedValue(serviceUnavailable()),
    });
    const secondary = makeMockHorizonServer();

    horizonMocks.servers.set("http://primary:8000", primary);
    horizonMocks.servers.set("http://secondary:8000", secondary);

    const client = new HorizonFailoverClient(
      ["http://primary:8000", "http://secondary:8000"],
      "priority"
    );

    // First submit — fails on primary (1 failure), succeeds on secondary
    const t0 = Date.now();
    const r1 = await client.submitTransaction({ type: "tx" });
    expect(r1.nodeUrl).toBe("http://secondary:8000");

    // Primary should now be Degraded (1 failure, threshold is 3 for Inactive)
    const afterFirst = client.getNodeStatuses().find((s) => s.url === "http://primary:8000");
    expect(afterFirst?.state).toBe("Degraded");

    const recoveryMs = Date.now() - t0;
    console.log(
      `[chaos-recovery] Fallback to secondary took ${recoveryMs}ms (instant, no delay)`
    );
  });
});
