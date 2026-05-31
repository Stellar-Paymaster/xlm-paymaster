import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisRateLimitStore } from "./redisRateLimitStore";
import type { RedisClient } from "./redisClientFactory";

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
