import { NextFunction, Request, Response } from "express";
import { ApiKeyConfig, maskApiKey } from "./apiKeys";
import { consumeLeakyBucket } from "../utils/redis";
import { TenantUsageTracker } from "../services/tenantUsageTracker";

// Fallback in-memory leaky bucket if Redis is unavailable.
interface LeakyBucketEntry {
  tat: number; // Theoretical Arrival Time
}

const usageByApiKey = new Map<string, LeakyBucketEntry>();
const usageTracker = new TenantUsageTracker();

function consumeFallbackBucket(apiKeyConfig: ApiKeyConfig): { allowed: boolean; remaining: number; retryAfterMs: number; resetMs: number } {
  const now = Date.now();
  const capacity = apiKeyConfig.rateLimit;
  const windowMs = apiKeyConfig.windowMs;
  const emissionInterval = windowMs / capacity;

  let entry = usageByApiKey.get(apiKeyConfig.key);
  if (!entry) {
    entry = { tat: now };
    usageByApiKey.set(apiKeyConfig.key, entry);
  }

  const tat = Math.max(entry.tat, now);
  const newTat = tat + emissionInterval;

  if (newTat - now > windowMs) {
    // Rejected
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.ceil(newTat - now - windowMs),
      resetMs: Math.ceil(tat - now)
    };
  }

  // Accepted
  entry.tat = newTat;
  return {
    allowed: true,
    remaining: Math.floor((windowMs - (newTat - now)) / emissionInterval),
    retryAfterMs: 0,
    resetMs: Math.ceil(newTat - now)
  };
}

export async function apiKeyRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;

  if (!apiKeyConfig) {
    res.status(500).json({
      error: "API key context missing before rate limiting.",
    });
    return;
  }

  const rateLimit = apiKeyConfig.rateLimit;
  const windowMs = apiKeyConfig.windowMs;

  // Try Redis leaky bucket first.
  try {
    const key = `rl:${apiKeyConfig.key}`;
    const result = await consumeLeakyBucket(key, rateLimit, windowMs);

    if (result) {
      const { allowed, remaining, retryAfterMs, resetMs } = result;

      res.setHeader("X-RateLimit-Limit", rateLimit.toString());
      res.setHeader("X-RateLimit-Remaining", remaining.toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + resetMs) / 1000).toString());

      if (!allowed) {
        // Record violation for intelligent rate limiting
        usageTracker.recordViolation(apiKeyConfig.tenantId).catch(() => { }); // Don't block on errors

        res.status(429).json({
          error: `API key rate limit exceeded for ${maskApiKey(apiKeyConfig.key)} (${apiKeyConfig.tierName} tier).`,
          tier: apiKeyConfig.tier,
          tierName: apiKeyConfig.tierName,
          limit: rateLimit,
          retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1),
        });
        return;
      }

      // Record successful request for intelligent rate limiting
      usageTracker.recordRequest(apiKeyConfig.tenantId).catch(() => { }); // Don't block on errors

      // allowed
      next();
      return;
    }
  } catch (err) {
    // If Redis helper threw, we'll fall back to in-memory below.
  }

  // Fallback to in-memory windowing if Redis is unavailable
  const fallbackResult = consumeFallbackBucket(apiKeyConfig);

  res.setHeader("X-RateLimit-Limit", rateLimit.toString());
  res.setHeader("X-RateLimit-Remaining", fallbackResult.remaining.toString());
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + fallbackResult.resetMs) / 1000).toString());

  if (!fallbackResult.allowed) {
    // Record violation for intelligent rate limiting
    usageTracker.recordViolation(apiKeyConfig.tenantId).catch(() => { }); // Don't block on errors

    res.status(429).json({
      error: `API key rate limit exceeded for ${maskApiKey(apiKeyConfig.key)} (${apiKeyConfig.tierName} tier).`,
      tier: apiKeyConfig.tier,
      tierName: apiKeyConfig.tierName,
      limit: rateLimit,
      retryAfterSeconds: Math.max(Math.ceil(fallbackResult.retryAfterMs / 1000), 1),
    });
    return;
  }

  // Record successful request for intelligent rate limiting
  usageTracker.recordRequest(apiKeyConfig.tenantId).catch(() => { }); // Don't block on errors

  next();
}
