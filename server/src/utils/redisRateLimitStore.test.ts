import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisRateLimitStore } from "./redisRateLimitStore";
import type { RedisClient } from "./redisClientFactory";
import { logger } from "./logger";

vi.mock("./logger", () => ({
  logger: {
    error: vi.fn(),
  },
  serializeError: (e: any) => e,
}));
/**
 * In-memory Redis mock with controllable time for fixed-window boundary tests.
 */
class MockRedisClient {
  private store = new Map<string, { count: number; expiresAtMs: number }>();
  private nowMs = Date.now();

  setNow(ms: number): void {
    this.nowMs = ms;
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || this.nowMs >= entry.expiresAtMs) {
      this.store.set(key, { count: 1, expiresAtMs: this.nowMs + 60_000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAtMs = this.nowMs + seconds * 1000;
    }
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    const remaining = Math.ceil((entry.expiresAtMs - this.nowMs) / 1000);
    return Math.max(remaining, 0);
  }

  async decr(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.count = Math.max(0, entry.count - 1);
    return entry.count;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe("RedisRateLimitStore — fixed window boundary behavior", () => {
  let mockRedis: MockRedisClient;
  let store: RedisRateLimitStore;
  const WINDOW_SECONDS = 60;
  const LIMIT = 5;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRedis = new MockRedisClient();
    store = new RedisRateLimitStore(mockRedis as unknown as RedisClient, WINDOW_SECONDS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets expiry on first increment and tracks hits", async () => {
    const result = await store.increment("ip:127.0.0.1");
    expect(result.totalHits).toBe(1);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it("blocks at limit within window (59th second still in same window)", async () => {
    const key = "ip:test-client";
    for (let i = 0; i < LIMIT; i++) {
      const result = await store.increment(key);
      expect(result.totalHits).toBe(i + 1);
    }

    mockRedis.advance(59_000);
    vi.setSystemTime(Date.now() + 59_000);

    const overLimit = await store.increment(key);
    expect(overLimit.totalHits).toBe(LIMIT + 1);
  });

  it("resets counter at 60-second window boundary", async () => {
    const key = "ip:boundary-client";

    for (let i = 0; i < LIMIT; i++) {
      await store.increment(key);
    }

    mockRedis.advance(60_000);
    vi.setSystemTime(Date.now() + 60_000);

    const freshWindow = await store.increment(key);
    expect(freshWindow.totalHits).toBe(1);
  });

  it("wraps keys in hash tags for Redis Cluster compatibility", async () => {
    await store.increment("plain-key");
    const clusterKey = "{plain-key}";
    expect(await mockRedis.ttl(clusterKey)).toBeGreaterThanOrEqual(0);
  });

  it("resetKey clears the counter for a fresh window", async () => {
    const key = "ip:reset-test";
    await store.increment(key);
    await store.increment(key);
    await store.resetKey(key);

    const afterReset = await store.increment(key);
    expect(afterReset.totalHits).toBe(1);
  });
});

describe("RedisRateLimitStore — Redis fallback behavior", () => {
  let store: RedisRateLimitStore;
  let mockRedis: any;
  const WINDOW_SECONDS = 60;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    
    // Create a mock redis client that throws
    mockRedis = {
      incr: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
      expire: vi.fn(),
      ttl: vi.fn(),
      decr: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
      del: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
    };
    
    store = new RedisRateLimitStore(mockRedis as unknown as RedisClient, WINDOW_SECONDS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("catches increment errors, alerts, and falls back to strict 2-request limit", async () => {
    const key = "ip:fallback-test";
    
    // First request should be allowed (totalHits = 1)
    const req1 = await store.increment(key);
    expect(req1.totalHits).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: true,
        event: "REDIS_CLUSTER_NODE_FAILURE"
      })
    );

    // Second request should be allowed (totalHits = 1 as well in fallback or at least not blocked)
    const req2 = await store.increment(key);
    // Since fallback returns result.allowed ? 1 : Number.MAX_SAFE_INTEGER, it should be 1
    expect(req2.totalHits).toBe(1);

    // Third request should be blocked (totalHits = Number.MAX_SAFE_INTEGER)
    const req3 = await store.increment(key);
    expect(req3.totalHits).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("catches decrement errors and alerts", async () => {
    await store.decrement("ip:fallback-test");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: true,
        event: "REDIS_CLUSTER_NODE_FAILURE"
      })
    );
  });

  it("catches resetKey errors and alerts", async () => {
    await store.resetKey("ip:fallback-test");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: true,
        event: "REDIS_CLUSTER_NODE_FAILURE"
      })
    );
  });
});
