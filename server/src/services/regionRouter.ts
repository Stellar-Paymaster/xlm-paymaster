/**
 * Data Residency Region Router
 *
 * Maintains one Prisma client per configured region. The instance's home region
 * is set via DATABASE_REGION. Each region's connection string is supplied via
 * DATABASE_URL_<REGION> (e.g. DATABASE_URL_EU, DATABASE_URL_US).
 *
 * When an API key is resolved, the middleware calls getDbForRegion() with the
 * tenant's stored region so all subsequent DB writes land in the correct
 * regional database.
 *
 * Fallback chain:
 *   1. DATABASE_URL_<REGION>   – region-specific URL
 *   2. DATABASE_URL            – shared / single-region URL
 *   3. file:./dev.db           – local dev default
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "region_router" });

export const SUPPORTED_REGIONS = ["US", "EU"] as const;
export type Region = (typeof SUPPORTED_REGIONS)[number];

export const DEFAULT_REGION: Region =
  (process.env.DATABASE_REGION?.toUpperCase() as Region | undefined) ?? "US";

type PrismaClientLike = { [key: string]: any };

type PrismaModule = {
  PrismaClient: new (options?: { adapter?: any; log?: string[] }) => PrismaClientLike;
};

function loadPrismaClient(): PrismaModule["PrismaClient"] {
  const mod = require("@prisma/client") as PrismaModule;
  return mod.PrismaClient;
}

function buildClient(url: string): PrismaClientLike {
  const PrismaClient = loadPrismaClient();
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

/**
 * Resolve the database URL for a given region.
 *
 * Priority:
 *   1. DATABASE_URL_<REGION>  (e.g. DATABASE_URL_EU)
 *   2. DATABASE_URL
 *   3. file:./dev.db
 */
export function resolveDbUrl(region: Region): string {
  const regionKey = `DATABASE_URL_${region.toUpperCase()}`;
  return (
    process.env[regionKey] ??
    process.env.DATABASE_URL ??
    "file:./dev.db"
  );
}

// Pool of Prisma clients, keyed by region
const clientPool = new Map<Region, PrismaClientLike>();

/**
 * Return (or lazily create) the Prisma client for the given region.
 */
export function getDbForRegion(region: Region): PrismaClientLike {
  const existing = clientPool.get(region);
  if (existing) return existing;

  const url = resolveDbUrl(region);
  logger.info({ region, url: url.startsWith("file:") ? url : "<redacted>" }, "Creating DB client for region");
  const client = buildClient(url);
  clientPool.set(region, client);
  return client;
}

/**
 * Warm up Prisma clients for all configured regions on startup.
 * Only creates clients where a region-specific URL is configured.
 */
export function initializeRegionalDbs(): void {
  for (const region of SUPPORTED_REGIONS) {
    const regionKey = `DATABASE_URL_${region}`;
    if (process.env[regionKey] || region === DEFAULT_REGION) {
      getDbForRegion(region);
    }
  }
  logger.info(
    { defaultRegion: DEFAULT_REGION, configuredRegions: Array.from(clientPool.keys()) },
    "Regional DB pool initialized"
  );
}

/**
 * Search all configured regional DBs for a given API key.
 * Returns the first match along with the resolved region, or null if not found.
 *
 * This is the bootstrap lookup: before we know a tenant's region we try every
 * configured region in parallel so we always find the key regardless of which
 * regional DB it lives in.
 */
export async function findApiKeyAcrossRegions(
  apiKey: string
): Promise<{ record: any; region: Region } | null> {
  const regions = SUPPORTED_REGIONS.filter(
    (r) => process.env[`DATABASE_URL_${r}`] || r === DEFAULT_REGION
  );

  const results = await Promise.allSettled(
    regions.map(async (region) => {
      const db = getDbForRegion(region);
      const record = await db.apiKey.findUnique({
        where: { key: apiKey },
        include: { tenant: { include: { subscriptionTier: true } } },
      });
      return record ? { record, region } : null;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      return result.value;
    }
  }
  return null;
}

/**
 * Return true if a regional-specific DATABASE_URL is configured for the given region,
 * meaning this region has its own isolated database.
 */
export function isRegionIsolated(region: Region): boolean {
  return !!process.env[`DATABASE_URL_${region.toUpperCase()}`];
}

export function getConfiguredRegions(): Region[] {
  return SUPPORTED_REGIONS.filter(
    (r) => process.env[`DATABASE_URL_${r}`] || r === DEFAULT_REGION
  );
}
