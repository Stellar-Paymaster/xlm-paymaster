import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import prisma from "../utils/db";
import {
  getCachedApiKey,
  setCachedApiKey,
  invalidateApiKeyCache,
} from "../utils/redis";
import {
  SubscriptionTierCode,
  SubscriptionTierName,
  toTierCode,
} from "../models/subscriptionTier";
import {
  Region,
  DEFAULT_REGION,
  getDbForRegion,
  findApiKeyAcrossRegions,
} from "../services/regionRouter";

// When STATELESS_MODE=true the in-memory API_KEYS map is bypassed so that
// every instance resolves keys exclusively from Redis → DB. This is required
// for horizontal scaling: a key registered on one instance must be visible to
// all other instances without a restart.
const STATELESS_MODE = process.env.STATELESS_MODE === "true";

export const VALID_CHAINS = ["stellar", "evm", "solana", "cosmos"] as const;
export type Chain = (typeof VALID_CHAINS)[number];

export interface ApiKeyConfig {
  key: string;
  tenantId: string;
  name: string;
  tier: SubscriptionTierCode;
  tierName: SubscriptionTierName;
  tierId: string;
  txLimit: number;
  rateLimit: number;
  priceMonthly: number;
  maxRequests: number;
  windowMs: number;
  dailyQuotaStroops: number;
  isSandbox: boolean;
  allowedChains: Chain[];
  region: Region;
}

function parseAllowedChains(raw?: string | null): Chain[] {
  if (!raw) return ["stellar"];
  const chains = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Chain => (VALID_CHAINS as readonly string[]).includes(s));
  return chains.length > 0 ? chains : ["stellar"];
}

const API_KEYS = new Map<string, ApiKeyConfig>();

function getApiKeyFromHeader(req: Request): string | undefined {
  const headerValue = req.header("x-api-key");
  if (typeof headerValue !== "string") return undefined;
  const apiKey = headerValue.trim();
  return apiKey.length > 0 ? apiKey : undefined;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***`;
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = getApiKeyFromHeader(req);

  if (!apiKey) {
    return next(
      new AppError(
        "Missing API key. Provide a valid x-api-key header to access this endpoint.",
        401,
        "AUTH_FAILED",
      ),
    );
  }

  // 1) Try Redis cache first
  try {
    const cached = await getCachedApiKey(apiKey);
    if (cached) {
      // Cache stores the ApiKeyConfig as a JSON string
      // eslint-disable-next-line no-console
      console.log("[Redis] Cache Hit for API key:", maskApiKey(apiKey));

      const apiKeyConfig = JSON.parse(cached) as ApiKeyConfig;
      res.locals.apiKey = apiKeyConfig;
      res.locals.db = getDbForRegion(apiKeyConfig.region ?? DEFAULT_REGION);
      return next();
    }
  } catch (err) {
    // If Redis fails, fall back to DB/in-memory lookup below.
  }

  // 2) Try DB (Prisma) lookup — searches all configured regional DBs
  try {
    const found = await findApiKeyAcrossRegions(apiKey);

    if (found) {
      const { record: keyRecord, region } = found;

      // Reject revoked keys immediately
      if (!keyRecord.active) {
        return next(
          new AppError("API key has been revoked.", 403, "AUTH_FAILED"),
        );
      }

      const tierRecord = keyRecord.tenant?.subscriptionTier;
      const resolvedTierName = (tierRecord?.name ??
        "Free") as SubscriptionTierName;
      const resolvedRateLimit = tierRecord?.rateLimit ?? keyRecord.maxRequests;

      const allowedChains = parseAllowedChains(keyRecord.allowedChains);

      const apiKeyConfig: ApiKeyConfig = {
        key: keyRecord.key,
        tenantId: keyRecord.tenantId,
        name: keyRecord.name ?? keyRecord.tenant?.name ?? keyRecord.prefix,
        tier: toTierCode(resolvedTierName),
        tierName: resolvedTierName,
        tierId: tierRecord?.id ?? `tier-${toTierCode(resolvedTierName)}`,
        txLimit: tierRecord?.txLimit ?? 10,
        rateLimit: resolvedRateLimit,
        priceMonthly: tierRecord?.priceMonthly ?? 0,
        maxRequests: resolvedRateLimit,
        windowMs: keyRecord.windowMs,
        dailyQuotaStroops: Number(keyRecord.dailyQuotaStroops),
        isSandbox: keyRecord.isSandbox ?? false,
        allowedChains,
        region: (keyRecord.tenant?.region as Region | undefined) ?? region,
      };

      // Cache the key for future requests. Non-blocking: don't fail the request on cache errors.
      setCachedApiKey(apiKey, JSON.stringify(apiKeyConfig), 300).catch(
        () => {},
      );

      res.locals.apiKey = apiKeyConfig;
      // Attach the correct regional DB client so handlers write to the right region
      res.locals.db = getDbForRegion(apiKeyConfig.region);
      return next();
    }
  } catch (err) {
    // DB error — continue to in-memory fallback
  }

  // 3) In-memory fallback — disabled in STATELESS_MODE to prevent per-instance
  //    divergence when running multiple replicas behind a load balancer.
  if (!STATELESS_MODE) {
    const apiKeyConfig = API_KEYS.get(apiKey);

    if (apiKeyConfig) {
      // Cache in Redis asynchronously for future hits
      setCachedApiKey(apiKey, JSON.stringify(apiKeyConfig), 300).catch(() => {});

      res.locals.apiKey = apiKeyConfig;
      res.locals.db = getDbForRegion(apiKeyConfig.region ?? DEFAULT_REGION);
      next();
      return;
    }
  }

  return next(new AppError("Invalid API key.", 403, "AUTH_FAILED"));
}

export function listApiKeys(): ApiKeyConfig[] {
  return Array.from(API_KEYS.values());
}

// Expose an invalidate helper so other parts of the app can clear cache after updates.
export async function invalidateCachedApiKey(apiKey: string): Promise<void> {
  try {
    await invalidateApiKeyCache(apiKey);
  } catch (err) {
    // ignore cache invalidation errors
  }
}

// Allow programmatic upsert/delete of the in-memory API_KEYS map.
export function upsertApiKey(apiKeyConfig: ApiKeyConfig): void {
  API_KEYS.set(apiKeyConfig.key, apiKeyConfig);
  // Also set cache so immediate requests will hit Redis
  setCachedApiKey(apiKeyConfig.key, JSON.stringify(apiKeyConfig), 300).catch(
    () => {},
  );
}

export function deleteApiKey(key: string): void {
  API_KEYS.delete(key);
  // Also invalidate cache
  invalidateApiKeyCache(key).catch(() => {});
}

/**
 * Middleware factory that rejects requests if the API key is not authorized
 * for the given chain. Must be placed after `apiKeyMiddleware`.
 */
export function requireChain(chain: Chain) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const config = res.locals.apiKey as ApiKeyConfig | undefined;
    if (!config) {
      return next(new AppError("Missing API key context.", 401, "AUTH_FAILED"));
    }
    if (!config.allowedChains.includes(chain)) {
      return next(
        new AppError(
          `API key is not authorized for the "${chain}" chain. Allowed: ${config.allowedChains.join(", ")}.`,
          403,
          "CHAIN_NOT_ALLOWED",
        ),
      );
    }
    next();
  };
}
