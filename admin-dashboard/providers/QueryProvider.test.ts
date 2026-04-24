import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUERY_DEFAULTS,
  createQueryClient,
  isHttpError,
  retryDelay,
  shouldRetry,
} from "./queryConfig.ts";

// ─── QUERY_DEFAULTS ─────────────────────────────────────────────────────────

test("QUERY_DEFAULTS documents a stale-while-revalidate contract", () => {
  assert.ok(
    QUERY_DEFAULTS.staleTime > 0,
    "staleTime must be positive so stale-while-revalidate has a freshness window",
  );
  assert.ok(
    QUERY_DEFAULTS.gcTime > QUERY_DEFAULTS.staleTime,
    "gcTime must exceed staleTime so reloads within the freshness window hit the cache",
  );
});

test("QUERY_DEFAULTS turns on automatic refetch on reconnect (acceptance criterion)", () => {
  assert.equal(QUERY_DEFAULTS.refetchOnReconnect, true);
});

test("QUERY_DEFAULTS turns on refetch on window focus for cross-tab consistency", () => {
  assert.equal(QUERY_DEFAULTS.refetchOnWindowFocus, true);
});

// ─── shouldRetry ────────────────────────────────────────────────────────────

test("shouldRetry returns false after QUERY_DEFAULTS.retry attempts", () => {
  assert.equal(shouldRetry(QUERY_DEFAULTS.retry, new Error("boom")), false);
  assert.equal(shouldRetry(QUERY_DEFAULTS.retry + 5, new Error("boom")), false);
});

test("shouldRetry keeps trying on generic errors below the retry cap", () => {
  assert.equal(shouldRetry(0, new Error("network blip")), true);
  assert.equal(shouldRetry(1, new Error("network blip")), true);
});

test("shouldRetry stops retrying on 4xx client errors — the caller can't fix them", () => {
  assert.equal(shouldRetry(0, { status: 400 }), false);
  assert.equal(shouldRetry(0, { status: 401 }), false);
  assert.equal(shouldRetry(0, { status: 404 }), false);
  assert.equal(shouldRetry(0, { status: 422 }), false);
});

test("shouldRetry continues on 5xx server errors and network/transport errors", () => {
  assert.equal(shouldRetry(0, { status: 500 }), true);
  assert.equal(shouldRetry(0, { status: 502 }), true);
  assert.equal(shouldRetry(0, { status: 503 }), true);
  assert.equal(shouldRetry(0, { status: 504 }), true);
});

test("shouldRetry continues on non-HTTP errors (no status field)", () => {
  assert.equal(shouldRetry(0, new TypeError("fetch failed")), true);
  assert.equal(shouldRetry(0, "plain string error"), true);
  assert.equal(shouldRetry(0, null), true);
});

// ─── retryDelay ─────────────────────────────────────────────────────────────

test("retryDelay grows exponentially with each attempt", () => {
  const a0 = retryDelay(0);
  const a1 = retryDelay(1);
  const a2 = retryDelay(2);
  assert.ok(a1 > a0, `attempt 1 (${a1}ms) should exceed attempt 0 (${a0}ms)`);
  assert.ok(a2 > a1, `attempt 2 (${a2}ms) should exceed attempt 1 (${a1}ms)`);
});

test("retryDelay is capped at QUERY_DEFAULTS.retryDelayCapMs", () => {
  assert.equal(retryDelay(100), QUERY_DEFAULTS.retryDelayCapMs);
  assert.ok(retryDelay(50) <= QUERY_DEFAULTS.retryDelayCapMs);
});

test("retryDelay handles zero and negative attempts gracefully", () => {
  assert.equal(retryDelay(0), QUERY_DEFAULTS.retryDelayBaseMs);
  assert.equal(retryDelay(-5), QUERY_DEFAULTS.retryDelayBaseMs);
});

// ─── isHttpError ────────────────────────────────────────────────────────────

// ─── createQueryClient ──────────────────────────────────────────────────────

test("createQueryClient returns a QueryClient whose default options match QUERY_DEFAULTS", () => {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();

  assert.equal(defaults.queries?.staleTime, QUERY_DEFAULTS.staleTime);
  assert.equal(defaults.queries?.gcTime, QUERY_DEFAULTS.gcTime);
  assert.equal(
    defaults.queries?.refetchOnReconnect,
    QUERY_DEFAULTS.refetchOnReconnect,
  );
  assert.equal(
    defaults.queries?.refetchOnWindowFocus,
    QUERY_DEFAULTS.refetchOnWindowFocus,
  );
  assert.equal(
    defaults.queries?.refetchOnMount,
    QUERY_DEFAULTS.refetchOnMount,
  );
  assert.equal(typeof defaults.queries?.retry, "function");
  assert.equal(typeof defaults.queries?.retryDelay, "function");
  assert.equal(defaults.mutations?.retry, 1);
});

test("createQueryClient produces independent instances (no cross-test contamination)", () => {
  const a = createQueryClient();
  const b = createQueryClient();
  assert.notEqual(a, b);
  assert.notEqual(a.getQueryCache(), b.getQueryCache());
});

test("isHttpError narrows only to objects with a numeric `status`", () => {
  assert.equal(isHttpError({ status: 500 }), true);
  assert.equal(isHttpError({ status: 0 }), true);
  assert.equal(isHttpError({ status: "500" }), false);
  assert.equal(isHttpError({}), false);
  assert.equal(isHttpError(null), false);
  assert.equal(isHttpError(undefined), false);
  assert.equal(isHttpError("error"), false);
  assert.equal(isHttpError(42), false);
});
