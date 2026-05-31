import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sandboxRateLimit } from "./sandboxGuard";
import type { ApiKeyConfig } from "./apiKeys";

vi.mock("../utils/redis", () => ({
  incrWithExpiry: vi.fn().mockResolvedValue(null),
}));

function buildSandboxKey(overrides: Partial<ApiKeyConfig> = {}): ApiKeyConfig {
  return {
    key: "sbx-test-key",
    tenantId: "tenant-sbx",
    name: "Sandbox Key",
    tier: "free",
    tierName: "Free",
    tierId: "tier-free",
    txLimit: 10,
    rateLimit: 10,
    priceMonthly: 0,
    maxRequests: 10,
    windowMs: 60_000,
    dailyQuotaStroops: 1_000_000,
    isSandbox: true,
    ...overrides,
  };
}

function buildResponse(apiKey: ApiKeyConfig) {
  const headers = new Map<string, string>();
  return {
    locals: { apiKey },
    statusCode: 200,
    body: null as unknown,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
  };
}

describe("sandboxRateLimit — fixed window boundary (in-memory fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("allows up to SANDBOX_RATE_LIMIT_MAX requests, then blocks within window", async () => {
    const apiKey = buildSandboxKey({ key: "sbx-limit-test" });
    const limit = Number(process.env.SANDBOX_RATE_LIMIT_MAX ?? "10");
    const next = vi.fn();

    for (let i = 0; i < limit; i++) {
      const res = buildResponse(apiKey);
      await sandboxRateLimit({} as never, res as never, next);
      expect(res.statusCode).toBe(200);
    }

    const blocked = buildResponse(apiKey);
    await sandboxRateLimit({} as never, blocked as never, vi.fn());
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toMatchObject({ code: "SANDBOX_RATE_LIMITED" });
  });

  it("resets at 60-second window boundary (59s blocked, 60s allowed)", async () => {
    const apiKey = buildSandboxKey({ key: "sbx-window-test" });
    const limit = Number(process.env.SANDBOX_RATE_LIMIT_MAX ?? "10");
    const next = vi.fn();

    for (let i = 0; i < limit; i++) {
      await sandboxRateLimit({} as never, buildResponse(apiKey) as never, next);
    }

    vi.advanceTimersByTime(59_000);
    const stillBlocked = buildResponse(apiKey);
    await sandboxRateLimit({} as never, stillBlocked as never, vi.fn());
    expect(stillBlocked.statusCode).toBe(429);

    vi.advanceTimersByTime(1_000);
    const afterWindow = buildResponse(apiKey);
    await sandboxRateLimit({} as never, afterWindow as never, next);
    expect(afterWindow.statusCode).toBe(200);
  });

  it("skips non-sandbox keys", async () => {
    const apiKey = buildSandboxKey({ isSandbox: false });
    const next = vi.fn();
    const res = buildResponse(apiKey);
    await sandboxRateLimit({} as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
