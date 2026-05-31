import { describe, expect, it } from "vitest";
import {
  consumeFixedWindow,
  consumeGcraBucket,
  type FixedWindowState,
  type GcraState,
} from "./gcraLeakyBucket";

describe("GCRA leaky bucket — precise window boundaries", () => {
  const WINDOW_MS = 60_000;
  const CAPACITY = 5;

  it("allows exactly capacity requests in a burst at window start", () => {
    const state: GcraState = { tat: 0 };
    const config = { capacity: CAPACITY, windowMs: WINDOW_MS };
    const start = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      const result = consumeGcraBucket(state, config, start);
      expect(result.allowed).toBe(true);
    }

    const rejected = consumeGcraBucket(state, config, start);
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterMs).toBeGreaterThan(0);
  });

  it("rejects at the 59th second when bucket is full, then allows after refill", () => {
    const state: GcraState = { tat: 0 };
    const config = { capacity: 1, windowMs: WINDOW_MS };
    const start = 0;

    expect(consumeGcraBucket(state, config, start).allowed).toBe(true);

    const at59s = start + 59_000;
    const blocked = consumeGcraBucket(state, config, at59s);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    const afterWindow = start + WINDOW_MS + 1;
    expect(consumeGcraBucket(state, config, afterWindow).allowed).toBe(true);
  });

  it("gradually refills capacity between requests (no fixed-window burst at boundary)", () => {
    const state: GcraState = { tat: 0 };
    const config = { capacity: 60, windowMs: WINDOW_MS };
    const start = 0;

    for (let i = 0; i < 60; i++) {
      expect(consumeGcraBucket(state, config, start).allowed).toBe(true);
    }
    expect(consumeGcraBucket(state, config, start).allowed).toBe(false);

    const oneSecondLater = start + 1_000;
    expect(consumeGcraBucket(state, config, oneSecondLater).allowed).toBe(true);
    expect(consumeGcraBucket(state, config, oneSecondLater).allowed).toBe(false);
  });

  it("computes retryAfterMs of at least 1ms when nearly at boundary", () => {
    const state: GcraState = { tat: 0 };
    const config = { capacity: 1, windowMs: 1_000 };
    consumeGcraBucket(state, config, 0);

    const result = consumeGcraBucket(state, config, 1);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(1);
  });
});

describe("Fixed window — precise boundary at 59s / 60s rollover", () => {
  const WINDOW_MS = 60_000;
  const LIMIT = 5;

  it("allows limit requests within window, blocks limit+1, resets at window boundary", () => {
    const state: FixedWindowState = { count: 0, windowStartMs: 0 };
    const start = 0;

    for (let i = 0; i < LIMIT; i++) {
      const result = consumeFixedWindow(state, LIMIT, WINDOW_MS, start);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(i + 1);
    }

    const blocked = consumeFixedWindow(state, LIMIT, WINDOW_MS, start);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(LIMIT + 1);
    expect(blocked.remaining).toBe(0);
  });

  it("at 59s still counts against current window; at 60s starts fresh window", () => {
    const state: FixedWindowState = { count: 0, windowStartMs: 0 };

    for (let i = 0; i < LIMIT; i++) {
      consumeFixedWindow(state, LIMIT, WINDOW_MS, 0);
    }
    expect(consumeFixedWindow(state, LIMIT, WINDOW_MS, 59_000).allowed).toBe(false);

    const atBoundary = consumeFixedWindow(state, LIMIT, WINDOW_MS, 60_000);
    expect(atBoundary.allowed).toBe(true);
    expect(atBoundary.count).toBe(1);
    expect(atBoundary.remaining).toBe(LIMIT - 1);
  });

  it("classic double-capacity burst: N at end + N at start of next window", () => {
    const state: FixedWindowState = { count: 0, windowStartMs: 0 };
    const limit = 3;

    for (let i = 0; i < limit; i++) {
      consumeFixedWindow(state, limit, WINDOW_MS, 59_000);
    }
    expect(consumeFixedWindow(state, limit, WINDOW_MS, 59_000).allowed).toBe(false);

    for (let i = 0; i < limit; i++) {
      expect(consumeFixedWindow(state, limit, WINDOW_MS, 60_000).allowed).toBe(true);
    }
    expect(consumeFixedWindow(state, limit, WINDOW_MS, 60_000).allowed).toBe(false);
  });

  it("reports accurate ttlMs at 59th second of a 60-second window", () => {
    const state: FixedWindowState = { count: 0, windowStartMs: 0 };
    consumeFixedWindow(state, LIMIT, WINDOW_MS, 0);

    const at59s = consumeFixedWindow(state, LIMIT, WINDOW_MS, 59_000);
    expect(at59s.ttlMs).toBe(1_000);
  });
});
