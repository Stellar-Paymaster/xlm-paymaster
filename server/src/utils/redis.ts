import Redis, { Cluster } from "ioredis";
import { createRedisClientFromEnv, type RedisClient } from "./redisClientFactory";

// Create Redis client (single instance or cluster) from environment variables
const redis: RedisClient = createRedisClientFromEnv();

// Handle Redis client errors
redis.on("error", (err) => {
  // Keep errors visible in server logs. Do not crash the process here.
  // Consumers can fall back to in-memory behavior if Redis is unavailable.
  // eslint-disable-next-line no-console
  console.error("[Redis] error:", err.message || err);
});

// For Redis Cluster, also listen for cluster-specific events
if (redis instanceof Redis.Cluster) {
  redis.on("node error", (error, node) => {
    console.error(`[Redis Cluster] Node error (${node.address}):`, error.message || error);
  });
  
  redis.on("+node", (node) => {
    console.log(`[Redis Cluster] Node added: ${node.address}`);
  });
  
  redis.on("-node", (node) => {
    console.log(`[Redis Cluster] Node removed: ${node.address}`);
  });
}

export const API_KEY_PREFIX = "apiKey:";
export const RATE_LIMIT_PREFIX = "rl:";

export async function getCachedApiKey(key: string): Promise<string | null> {
  try {
    const clusterKey = ensureHashTag(API_KEY_PREFIX + key);
    const val = await redis.get(clusterKey);
    return val;
  } catch (err) {
    console.error(
      "[Redis] getCachedApiKey error:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function setCachedApiKey(
  key: string,
  value: string,
  ttlSec = 300,
): Promise<void> {
  try {
    const clusterKey = ensureHashTag(API_KEY_PREFIX + key);
    await redis.set(clusterKey, value, "EX", ttlSec);
  } catch (err) {
    console.error(
      "[Redis] setCachedApiKey error:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function invalidateApiKeyCache(key: string): Promise<void> {
  try {
    const clusterKey = ensureHashTag(API_KEY_PREFIX + key);
    await redis.del(clusterKey);
  } catch (err) {
    console.error(
      "[Redis] invalidateApiKeyCache error:",
      err instanceof Error ? err.message : err,
    );
  }
}

// Atomic increment with expiry helper for rate limiting.
// Returns {count, ttlSec}
export async function incrWithExpiry(
  key: string,
  expirySeconds: number,
): Promise<{ count: number; ttl: number } | null> {
  try {
    const clusterKey = ensureHashTag(key);
    const count = await redis.incr(clusterKey);

    if (count === 1) {
      // First increment - set expiry
      await redis.expire(clusterKey, expirySeconds);
    }

    const ttl = await redis.ttl(clusterKey);
    return { count: Number(count), ttl: Number(ttl) };
  } catch (err) {
    console.error(
      "[Redis] incrWithExpiry error:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// GCRA (Generic Cell Rate Algorithm) Leaky Bucket Lua script
const GCRA_LEAKY_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local emission_interval = windowMs / capacity
local tat = tonumber(redis.call("GET", key) or now)

tat = math.max(tat, now)
local new_tat = tat + emission_interval

if new_tat - now > windowMs then
  -- Rejected: Bucket overflow
  local remaining = 0
  local retry_after = math.ceil(new_tat - now - windowMs)
  local reset = math.ceil(tat - now)
  return { 0, remaining, retry_after, reset }
else
  -- Accepted
  redis.call("SET", key, new_tat, "PX", math.ceil(new_tat - now))
  local remaining = math.floor((windowMs - (new_tat - now)) / emission_interval)
  local reset = math.ceil(new_tat - now)
  return { 1, remaining, 0, reset }
end
`;

// Script SHA-1 hash for EVALSHA
let gcraScriptSha: string | null = null;

/**
 * Executes the GCRA leaky bucket Lua script.
 * Handles both Redis single instance and Redis Cluster.
 * For Redis Cluster, ensures the script is loaded on all master nodes.
 */
async function executeGcraScript(
  client: RedisClient,
  key: string,
  capacity: number,
  windowMs: number,
  now: number,
): Promise<[number, number, number, number]> {
  try {
    // For Redis Cluster, we need to handle script loading differently
    if (client instanceof Redis.Cluster) {
      return await executeGcraScriptCluster(client, key, capacity, windowMs, now);
    }
    
    // For single Redis instance, use defineCommand if not already defined
    if (!(client as any).gcraLeakyBucket) {
      (client as Redis).defineCommand("gcraLeakyBucket", {
        numberOfKeys: 1,
        lua: GCRA_LEAKY_BUCKET_SCRIPT,
      });
    }
    
    return await (client as any).gcraLeakyBucket(key, capacity, windowMs, now);
  } catch (error) {
    console.error("[Redis] Failed to execute GCRA script:", error);
    throw error;
  }
}

/**
 * Executes GCRA script on Redis Cluster.
 * Handles script loading and execution with proper error handling.
 */
async function executeGcraScriptCluster(
  cluster: Redis.Cluster,
  key: string,
  capacity: number,
  windowMs: number,
  now: number,
): Promise<[number, number, number, number]> {
  // Try EVALSHA first if we have the script hash
  if (gcraScriptSha) {
    try {
      const result = await cluster.evalsha(gcraScriptSha, 1, key, capacity, windowMs, now);
      return result as [number, number, number, number];
    } catch (error: any) {
      // If NOSCRIPT error, fall back to EVAL
      if (error.message?.includes("NOSCRIPT")) {
        gcraScriptSha = null;
      } else {
        throw error;
      }
    }
  }
  
  // Use EVAL and cache the script SHA
  const result = await cluster.eval(GCRA_LEAKY_BUCKET_SCRIPT, 1, key, capacity, windowMs, now);
  
  // Get script SHA for future EVALSHA calls
  try {
    gcraScriptSha = await cluster.script("LOAD", GCRA_LEAKY_BUCKET_SCRIPT);
  } catch (error) {
    console.warn("[Redis Cluster] Failed to cache script SHA:", error);
  }
  
  return result as [number, number, number, number];
}

export interface LeakyBucketResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  resetMs: number;
}

export async function consumeLeakyBucket(
  key: string,
  capacity: number,
  windowMs: number,
): Promise<LeakyBucketResult | null> {
  try {
    const now = Date.now();
    
    // For Redis Cluster compatibility, ensure the key uses hash tags
    // This ensures all keys in the Lua script are in the same slot
    const clusterKey = ensureHashTag(key);
    
    const result = await executeGcraScript(redis, clusterKey, capacity, windowMs, now);
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfterMs: result[2],
      resetMs: result[3],
    };
  } catch (err) {
    console.error(
      "[Redis] consumeLeakyBucket error:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Ensures a key has a hash tag for Redis Cluster compatibility.
 * Redis Cluster uses hash tags ({...}) to determine which slot a key belongs to.
 * If the key already contains a hash tag, it's returned as-is.
 * Otherwise, the entire key is wrapped in {} to ensure it goes to a consistent slot.
 * 
 * @param key The original key
 * @returns Key with hash tag for Redis Cluster compatibility
 */
export function ensureHashTag(key: string): string {
  // If key already contains a hash tag ({}), return as-is
  if (key.includes("{") && key.includes("}")) {
    return key;
  }
  
  // Otherwise, wrap the entire key in {} for consistent slot assignment
  return `{${key}}`;
}

export default redis;
