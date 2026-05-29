import { createRedisClient } from "./redisClientFactory";

// Build the connection via the shared factory so the production TLS policy
// (rediss:// + CA verification) is enforced in one place.
const redis = createRedisClient();

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

export default redis;
