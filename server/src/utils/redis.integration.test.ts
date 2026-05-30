import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Redis from "ioredis";
import { createRedisClient } from "./redisClientFactory";
import {
  getCachedApiKey,
  setCachedApiKey,
  invalidateApiKeyCache,
  incrWithExpiry,
  consumeLeakyBucket,
} from "./redis";

// These tests require a running Redis instance.
// For CI/CD, we should use a test Redis container.
// For now, they're skipped by default.
const describeIf = process.env.TEST_REDIS ? describe : describe.skip;

describeIf("Redis Integration Tests", () => {
  let redisClient: Redis;
  let testKey: string;

  beforeAll(() => {
    // Create a test Redis client
    redisClient = createRedisClient({
      url: process.env.TEST_REDIS_URL || "redis://127.0.0.1:6379",
    });
    
    testKey = `test:${Date.now()}:${Math.random()}`;
  });

  afterAll(async () => {
    // Clean up test keys
    await redisClient.del(testKey);
    await redisClient.del(`apiKey:${testKey}`);
    await redisClient.del(`rl:${testKey}`);
    
    // Close Redis connection
    await redisClient.quit();
  });

  describe("Basic Operations", () => {
    it("should set and get cached API key", async () => {
      const apiKey = `${testKey}:apikey`;
      const value = "test-api-key-value";
      
      await setCachedApiKey(apiKey, value, 10);
      const retrieved = await getCachedApiKey(apiKey);
      
      expect(retrieved).toBe(value);
    });

    it("should invalidate cached API key", async () => {
      const apiKey = `${testKey}:apikey2`;
      const value = "test-api-key-value-2";
      
      await setCachedApiKey(apiKey, value, 10);
      
      let retrieved = await getCachedApiKey(apiKey);
      expect(retrieved).toBe(value);
      
      await invalidateApiKeyCache(apiKey);
      
      retrieved = await getCachedApiKey(apiKey);
      expect(retrieved).toBeNull();
    });

    it("should increment with expiry", async () => {
      const key = `${testKey}:counter`;
      
      // First increment should set expiry
      const result1 = await incrWithExpiry(key, 10);
      expect(result1).toBeDefined();
      expect(result1!.count).toBe(1);
      expect(result1!.ttl).toBeGreaterThan(0);
      expect(result1!.ttl).toBeLessThanOrEqual(10);
      
      // Second increment should not set expiry
      const result2 = await incrWithExpiry(key, 10);
      expect(result2).toBeDefined();
      expect(result2!.count).toBe(2);
      expect(result2!.ttl).toBeGreaterThan(0);
      expect(result2!.ttl).toBeLessThanOrEqual(10);
    });
  });

  describe("Leaky Bucket Rate Limiting", () => {
    it("should allow requests within rate limit", async () => {
      const key = `${testKey}:leaky`;
      const capacity = 5;
      const windowMs = 10000; // 10 seconds
      
      // First 5 requests should be allowed
      for (let i = 0; i < capacity; i++) {
        const result = await consumeLeakyBucket(key, capacity, windowMs);
        expect(result).toBeDefined();
        expect(result!.allowed).toBe(true);
        expect(result!.remaining).toBe(capacity - i - 1);
      }
    });

    it("should reject requests exceeding rate limit", async () => {
      const key = `${testKey}:leaky2`;
      const capacity = 2;
      const windowMs = 5000; // 5 seconds
      
      // First 2 requests should be allowed
      for (let i = 0; i < capacity; i++) {
        const result = await consumeLeakyBucket(key, capacity, windowMs);
        expect(result).toBeDefined();
        expect(result!.allowed).toBe(true);
      }
      
      // Third request should be rejected
      const result = await consumeLeakyBucket(key, capacity, windowMs);
      expect(result).toBeDefined();
      expect(result!.allowed).toBe(false);
      expect(result!.retryAfterMs).toBeGreaterThan(0);
    });

    it("should reset after window passes", async () => {
      const key = `${testKey}:leaky3`;
      const capacity = 1;
      const windowMs = 1000; // 1 second
      
      // First request should be allowed
      const result1 = await consumeLeakyBucket(key, capacity, windowMs);
      expect(result1).toBeDefined();
      expect(result1!.allowed).toBe(true);
      
      // Second request immediately should be rejected
      const result2 = await consumeLeakyBucket(key, capacity, windowMs);
      expect(result2).toBeDefined();
      expect(result2!.allowed).toBe(false);
      
      // Wait for window to pass
      await new Promise(resolve => setTimeout(resolve, windowMs + 100));
      
      // Next request should be allowed again
      const result3 = await consumeLeakyBucket(key, capacity, windowMs);
      expect(result3).toBeDefined();
      expect(result3!.allowed).toBe(true);
    });
  });
});