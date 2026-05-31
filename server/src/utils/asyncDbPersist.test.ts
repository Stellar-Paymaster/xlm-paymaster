import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Prisma mock ───────────────────────────────────────────────────────────────
vi.mock("./db", () => {
  const mockPrisma = {
    transaction: {
      create: vi.fn(),
    },
  };
  return {
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

// ── Logger mock ───────────────────────────────────────────────────────────────
vi.mock("./logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { prisma } from "./db";
import {
  persistTransactionAsync,
  persistTransactionWithRetry,
  type TransactionPersistData,
} from "./asyncDbPersist";

const mockCreate = vi.mocked(prisma.transaction.create);

function sampleData(overrides: Partial<TransactionPersistData> = {}): TransactionPersistData {
  return {
    innerTxHash: "abc123def456",
    tenantId: "tenant-1",
    status: "PENDING",
    costStroops: 1000,
    category: "Payment",
    ...overrides,
  };
}

describe("persistTransactionAsync", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not block the caller — returns before the DB write resolves", async () => {
    // The DB write takes 50 ms; the caller should return immediately.
    const DB_WRITE_DELAY = 50;
    mockCreate.mockImplementation(
      () =>
        new Promise<any>((resolve) =>
          setTimeout(() => resolve({ id: "new-id" }), DB_WRITE_DELAY),
        ),
    );

    const start = Date.now();
    persistTransactionAsync(sampleData());
    const elapsed = Date.now() - start;

    // Should return well before the simulated DB delay
    expect(elapsed).toBeLessThan(DB_WRITE_DELAY);
  });

  it("calls prisma.transaction.create with the correct data", async () => {
    mockCreate.mockResolvedValue({ id: "created-id" } as any);

    persistTransactionAsync(sampleData({ id: "preset-uuid" }));

    // Drain the microtask queue so the promise chain runs
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      id: "preset-uuid",
      innerTxHash: "abc123def456",
      tenantId: "tenant-1",
      status: "PENDING",
      costStroops: BigInt(1000),
      category: "Payment",
    });
  });

  it("omits id field when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "auto-id" } as any);

    persistTransactionAsync(sampleData());
    await new Promise<void>((resolve) => setImmediate(resolve));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("id");
  });

  it("handles a null tenantId by omitting tenantId from the create payload", async () => {
    mockCreate.mockResolvedValue({ id: "new-id" } as any);

    persistTransactionAsync(sampleData({ tenantId: null }));
    await new Promise<void>((resolve) => setImmediate(resolve));

    const callArg = mockCreate.mock.calls[0][0];
    // tenantId: null → undefined → omitted from Prisma data object
    expect(callArg.data.tenantId).toBeUndefined();
  });

  it("logs an error but does NOT throw when the DB write fails", async () => {
    mockCreate.mockRejectedValue(new Error("DB connection lost"));

    // Must not throw
    expect(() => persistTransactionAsync(sampleData())).not.toThrow();

    // Allow the rejection handler to run
    await new Promise<void>((resolve) => setImmediate(resolve));
    // If we reach here without an unhandled rejection, the error was caught
  });

  it("includes the optional chain field when provided", async () => {
    mockCreate.mockResolvedValue({ id: "new-id" } as any);

    persistTransactionAsync(sampleData({ chain: "evm" }));
    await new Promise<void>((resolve) => setImmediate(resolve));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.chain).toBe("evm");
  });

  it("omits chain field when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "new-id" } as any);

    const data = sampleData();
    delete data.chain;
    persistTransactionAsync(data);
    await new Promise<void>((resolve) => setImmediate(resolve));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("chain");
  });
});

describe("persistTransactionWithRetry", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("resolves immediately when the first attempt succeeds", async () => {
    mockCreate.mockResolvedValue({ id: "ok-id" } as any);

    await persistTransactionWithRetry(sampleData());

    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("retries on failure and succeeds on the second attempt", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("transient error"))
      .mockResolvedValue({ id: "ok-id" } as any);

    const promise = persistTransactionWithRetry(sampleData(), 3);

    // Advance time past the first retry delay (100 ms)
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("exhausts all retries and resolves (does not throw) when every attempt fails", async () => {
    mockCreate.mockRejectedValue(new Error("persistent error"));

    const promise = persistTransactionWithRetry(sampleData(), 2);

    // 3 attempts: delays of 100 ms, 200 ms
    await vi.advanceTimersByTimeAsync(1000);
    await promise; // should resolve, not reject

    // attempt 0, attempt 1, attempt 2 → 3 total
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff between attempts", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("err"))
      .mockRejectedValueOnce(new Error("err"))
      .mockResolvedValue({ id: "ok-id" } as any);

    const promise = persistTransactionWithRetry(sampleData(), 3);

    // First retry delay: 100 ms (2^0 * 100)
    await vi.advanceTimersByTimeAsync(100);
    // Second retry delay: 200 ms (2^1 * 100)
    await vi.advanceTimersByTimeAsync(200);

    await promise;
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("uses the default maxRetries of 3 when not specified", async () => {
    mockCreate.mockRejectedValue(new Error("always fails"));

    const promise = persistTransactionWithRetry(sampleData());

    // Advance through 3 retry delays: 100 + 200 + 400 ms
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    // 1 initial + 3 retries = 4 total calls
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("handles null tenantId correctly", async () => {
    mockCreate.mockResolvedValue({ id: "ok-id" } as any);

    await persistTransactionWithRetry(sampleData({ tenantId: null }));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.tenantId).toBeUndefined();
  });
});
