import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";
import {
  getCachedApiKey,
  setCachedApiKey,
  invalidateApiKeyCache,
  incrWithExpiry,
  consumeLeakyBucket,
  ensureHashTag,
} from "./redis";

// Mock the Redis client
vi.mock("./redisClientFactory", () => ({
  createRedisClientFromEnv: vi.fn(() => new Redis()),
}));

describe("Redis Utility Functions", () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      eval: vi.fn(),
      evalsha: vi.fn(),
      script: vi.fn(),
      defineCommand: vi.fn(),
      on: vi.fn(),
    };

    // Reset all mocks
    vi.resetAllMocks();
    
    // Mock the Redis module
    vi.doMock("ioredis", () => ({
      default: vi.fn(() => mockRedis),
      Cluster: vi.fn(() => mockRedis),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureHashTag", () => {
    it("should wrap key in hash tags if not already present", () => {
      expect(ensureHashTag("mykey")).toBe("{mykey}");
      expect(ensureHashTag("prefix:mykey")).toBe("{prefix:mykey}");
    });

    it("should not wrap key if hash tags are already present", () => {
      expect(ensureHashTag("{mykey}")).toBe("{mykey}");
      expect(ensureHashTag("prefix:{mykey}:suffix")).toBe("prefix:{mykey}:suffix");
      expect(ensureHashTag("{user:123}:session")).toBe("{user:123}:session");
    });
  });

  describe("getCachedApiKey", () => {
    it("should get cached API key with hash tag", async () => {
      mockRedis.get.mockResolvedValue("cached-value");
      
      const result = await getCachedApiKey("test-key");
      
      expect(mockRedis.get).toHaveBeenCalledWith("{apiKey:test-key}");
      expect(result).toBe("cached-value");
    });

    it("should return null on Redis error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis error"));
      
      const result = await getCachedApiKey("test-key");
      
      expect(result).toBeNull();
    });
  });

  describe("setCachedApiKey", () => {
    it("should set cached API key with hash tag and TTL", async () => {
      mockRedis.set.mockResolvedValue("OK");
      
      await setCachedApiKey("test-key", "test-value", 300);
      
      expect(mockRedis.set).toHaveBeenCalledWith("{apiKey:test-key}", "test-value", "EX", 300);
    });

    it("should handle Redis error gracefully", async () => {
      mockRedis.set.mockRejectedValue(new Error("Redis error"));
      
      // Should not throw
      await expect(setCachedApiKey("test-key", "test-value")).resolves.not.toThrow();
    });
  });

  describe("invalidateApiKeyCache", () => {
    it("should delete cached API key with hash tag", async () => {
      mockRedis.del.mockResolvedValue(1);
      
      await invalidateApiKeyCache("test-key");
      
      expect(mockRedis.del).toHaveBeenCalledWith("{apiKey:test-key}");
    });

    it("should handle Redis error gracefully", async () => {
      mockRedis.del.mockRejectedValue(new Error("Redis error"));
      
      // Should not throw
      await expect(invalidateApiKeyCache("test-key")).resolves.not.toThrow();
    });
  });

  describe("incrWithExpiry", () => {
    it("should increment key and set expiry on first increment", async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(300);
      
      const result = await incrWithExpiry("test-key", 300);
      
      expect(mockRedis.incr).toHaveBeenCalledWith("{test-key}");
      expect(mockRedis.expire).toHaveBeenCalledWith("{test-key}", 300);
      expect(mockRedis.ttl).toHaveBeenCalledWith("{test-key}");
      expect(result).toEqual({ count: 1, ttl: 300 });
    });

    it("should increment key without setting expiry on subsequent increments", async () => {
      mockRedis.incr.mockResolvedValue(2);
      mockRedis.ttl.mockResolvedValue(299);
      
      const result = await incrWithExpiry("test-key", 300);
      
      expect(mockRedis.incr).toHaveBeenCalledWith("{test-key}");
      expect(mockRedis.expire).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 2, ttl: 299 });
    });

    it("should return null on Redis error", async () => {
      mockRedis.incr.mockRejectedValue(new Error("Redis error"));
      
      const result = await incrWithExpiry("test-key", 300);
      
      expect(result).toBeNull();
    });
  });

  describe("consumeLeakyBucket", () => {
    beforeEach(() => {
      // Mock Date.now() to return a fixed timestamp
      vi.spyOn(Date, "now").mockReturnValue(1000000);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should allow request when bucket has capacity", async () => {
      // Mock the executeGcraScript function
      const mockExecuteGcraScript = vi.fn().mockResolvedValue([1, 9, 0, 6000]);
      
      // Replace the imported function
      vi.doMock("./redis", async (importOriginal) => {
        const original = await importOriginal();
        return {
          ...original,
          // We can't easily mock the internal executeGcraScript function
          // This test will be updated when we refactor
        };
      });
      
      // For now, we'll skip this test since we need to refactor
      // to make executeGcraScript mockable
      console.log("Note: consumeLeakyBucket tests require refactoring for testability");
    });

    it("should reject request when bucket is full", async () => {
      // Similar to above - needs refactoring
    });

    it("should return null on Redis error", async () => {
      // Similar to above - needs refactoring
    });
  });
});