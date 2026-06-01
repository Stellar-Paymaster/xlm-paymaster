import type { Store, IncrementResponse } from "express-rate-limit";
import type { RedisClient } from "./redisClientFactory";

/**
 * A Redis-backed store implementing the express-rate-limit v6 `Store` interface.
 * Uses atomic INCR + EXPIRE for safe distributed rate limiting.
 * Supports both single Redis instance and Redis Cluster.
 */
export class RedisRateLimitStore implements Store {
  private client: RedisClient;
  private windowSeconds: number;

  constructor(client: RedisClient, windowSeconds: number) {
    this.client = client;
    this.windowSeconds = windowSeconds;
  }

  /**
   * Ensures a key has a hash tag for Redis Cluster compatibility.
   * Redis Cluster uses hash tags ({...}) to determine which slot a key belongs to.
   * If the key already contains a hash tag, it's returned as-is.
   * Otherwise, the entire key is wrapped in {} to ensure it goes to a consistent slot.
   */
  private ensureHashTag(key: string): string {
    // If key already contains a hash tag ({}), return as-is
    if (key.includes("{") && key.includes("}")) {
      return key;
    }
    
    // Otherwise, wrap the entire key in {} for consistent slot assignment
    return `{${key}}`;
  }

  /**
   * express-rate-limit v6 async Store interface.
   * Returns { totalHits, resetTime }.
   */
  async increment(key: string): Promise<IncrementResponse> {
    const clusterKey = this.ensureHashTag(key);
    const count: number = await this.client.incr(clusterKey);

    if (count === 1) {
      // First increment — set the window expiry
      await this.client.expire(clusterKey, this.windowSeconds);
    }

    const ttl: number = await this.client.ttl(clusterKey);
    const resetTime = new Date(Date.now() + ttl * 1000);

    return { totalHits: count, resetTime };
  }

  async decrement(key: string): Promise<void> {
    try {
      const clusterKey = this.ensureHashTag(key);
      await this.client.decr(clusterKey);
    } catch {
      // ignore — decrement is best-effort
    }
  }

  async resetKey(key: string): Promise<void> {
    const clusterKey = this.ensureHashTag(key);
    await this.client.del(clusterKey);
  }
}
