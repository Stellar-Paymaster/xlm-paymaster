import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We import the module under test AFTER stubbing env vars so that
// module-level constants pick up the correct values.
// Each test suite resets the module between tests where needed.

describe("resolveDbUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns DATABASE_URL_EU when region is EU and that env var is set", async () => {
    vi.stubEnv("DATABASE_URL_EU", "file:./eu.db");
    vi.stubEnv("DATABASE_URL", "file:./default.db");
    const { resolveDbUrl } = await import("./regionRouter");
    expect(resolveDbUrl("EU")).toBe("file:./eu.db");
  });

  it("returns DATABASE_URL_US when region is US and that env var is set", async () => {
    vi.stubEnv("DATABASE_URL_US", "file:./us.db");
    const { resolveDbUrl } = await import("./regionRouter");
    expect(resolveDbUrl("US")).toBe("file:./us.db");
  });

  it("falls back to DATABASE_URL when no region-specific URL is set", async () => {
    vi.stubEnv("DATABASE_URL", "file:./fallback.db");
    const { resolveDbUrl } = await import("./regionRouter");
    expect(resolveDbUrl("EU")).toBe("file:./fallback.db");
  });

  it("falls back to file:./dev.db when neither regional nor DATABASE_URL is set", async () => {
    const { resolveDbUrl } = await import("./regionRouter");
    expect(resolveDbUrl("EU")).toBe("file:./dev.db");
  });
});

describe("DEFAULT_REGION", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to US when DATABASE_REGION is not set", async () => {
    const { DEFAULT_REGION } = await import("./regionRouter");
    expect(DEFAULT_REGION).toBe("US");
  });

  it("reads DATABASE_REGION from env", async () => {
    vi.stubEnv("DATABASE_REGION", "EU");
    const { DEFAULT_REGION } = await import("./regionRouter");
    expect(DEFAULT_REGION).toBe("EU");
  });

  it("normalises lowercase to uppercase", async () => {
    vi.stubEnv("DATABASE_REGION", "eu");
    const { DEFAULT_REGION } = await import("./regionRouter");
    expect(DEFAULT_REGION).toBe("EU");
  });
});

describe("getDbForRegion", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    vi.stubEnv("DATABASE_URL_EU", "file:./eu.db");
    vi.stubEnv("DATABASE_URL_US", "file:./us.db");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the same client instance on repeated calls for the same region (pool caching)", async () => {
    const { getDbForRegion } = await import("./regionRouter");
    const a = getDbForRegion("EU");
    const b = getDbForRegion("EU");
    expect(a).toBe(b);
  });

  it("returns distinct clients for different regions", async () => {
    const { getDbForRegion } = await import("./regionRouter");
    const eu = getDbForRegion("EU");
    const us = getDbForRegion("US");
    expect(eu).not.toBe(us);
  });
});

describe("isRegionIsolated", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns true when DATABASE_URL_EU is configured", async () => {
    vi.stubEnv("DATABASE_URL_EU", "file:./eu.db");
    const { isRegionIsolated } = await import("./regionRouter");
    expect(isRegionIsolated("EU")).toBe(true);
  });

  it("returns false when DATABASE_URL_EU is not configured", async () => {
    const { isRegionIsolated } = await import("./regionRouter");
    expect(isRegionIsolated("EU")).toBe(false);
  });

  it("returns false for US when DATABASE_URL_US is absent", async () => {
    const { isRegionIsolated } = await import("./regionRouter");
    expect(isRegionIsolated("US")).toBe(false);
  });
});

describe("getConfiguredRegions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("always includes the default region", async () => {
    vi.stubEnv("DATABASE_REGION", "US");
    const { getConfiguredRegions } = await import("./regionRouter");
    expect(getConfiguredRegions()).toContain("US");
  });

  it("includes EU when DATABASE_URL_EU is configured", async () => {
    vi.stubEnv("DATABASE_URL_EU", "file:./eu.db");
    const { getConfiguredRegions } = await import("./regionRouter");
    expect(getConfiguredRegions()).toContain("EU");
  });

  it("excludes a region when its URL is not configured and it is not the default", async () => {
    vi.stubEnv("DATABASE_REGION", "US");
    // No DATABASE_URL_EU set
    const { getConfiguredRegions } = await import("./regionRouter");
    expect(getConfiguredRegions()).not.toContain("EU");
  });
});

describe("findApiKeyAcrossRegions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null for a key that does not exist in the dev database", async () => {
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    const { findApiKeyAcrossRegions } = await import("./regionRouter");
    const result = await findApiKeyAcrossRegions("sk_totally_nonexistent_xyz");
    expect(result).toBeNull();
  });

  it("does not throw when a regional DB lookup rejects (resilience)", async () => {
    // If one region's DB is misconfigured and throws, the function should still
    // return null rather than propagating the error to the caller.
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    // Pointing EU at a non-existent file forces a DB error
    vi.stubEnv("DATABASE_URL_EU", "file:./nonexistent_eu.db");

    const { findApiKeyAcrossRegions } = await import("./regionRouter");
    // Should resolve without throwing even if EU DB fails
    await expect(findApiKeyAcrossRegions("any-key")).resolves.toBeNull();
  });

  it("searches all configured regions (both US and EU) when both are set", async () => {
    vi.stubEnv("DATABASE_URL_EU", "file:./dev.db");
    vi.stubEnv("DATABASE_URL_US", "file:./dev.db");
    const { findApiKeyAcrossRegions } = await import("./regionRouter");
    // Both point to dev.db which has no matching key — result is null, but no error
    const result = await findApiKeyAcrossRegions("sk_multi_region_test");
    expect(result).toBeNull();
  });
});
