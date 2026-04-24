import Redis from "ioredis";

// Configure Redis connection via REDIS_URL env var, fallback to localhost
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

redis.on("error", (err) => {
  // Keep errors visible in server logs. Do not crash the process here.
  // Consumers can fall back to in-memory behavior if Redis is unavailable.
  // eslint-disable-next-line no-console
  console.error("[Redis] error:", err.message || err);
});

export const API_KEY_PREFIX = "apiKey:";
export const RATE_LIMIT_PREFIX = "rl:";

export async function getCachedApiKey(key: string): Promise<string | null> {
  try {
    const val = await redis.get(API_KEY_PREFIX + key);
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
    await redis.set(API_KEY_PREFIX + key, value, "EX", ttlSec);
  } catch (err) {
    console.error(
      "[Redis] setCachedApiKey error:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function invalidateApiKeyCache(key: string): Promise<void> {
  try {
    await redis.del(API_KEY_PREFIX + key);
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
    const count = await redis.incr(key);

    if (count === 1) {
      // First increment - set expiry
      await redis.expire(key, expirySeconds);
    }

    const ttl = await redis.ttl(key);
    return { count: Number(count), ttl: Number(ttl) };
  } catch (err) {
    console.error(
      "[Redis] incrWithExpiry error:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// Define GCRA (Generic Cell Rate Algorithm) Leaky Bucket Lua script
redis.defineCommand("gcraLeakyBucket", {
  numberOfKeys: 1,
  lua: `
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
  `,
});

// Extend Redis type to include our custom command
declare module "ioredis" {
  interface Redis {
    gcraLeakyBucket(
      key: string,
      capacity: number,
      windowMs: number,
      now: number,
    ): Promise<[number, number, number, number]>;
  }
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
    const result = await redis.gcraLeakyBucket(key, capacity, windowMs, now);
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

export default redis;
