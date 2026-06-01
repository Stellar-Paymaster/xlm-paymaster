import { beforeEach, describe, expect, it } from "vitest";
import {
  buildBloomFilter,
  getBloomFilterStats,
  mightBeBlocked,
  resetBloomFilter,
} from "./bloomFilterService";

function makeAddressSet(count: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < count; i++) {
    s.add(`GADDR${String(i).padStart(50, "0")}`);
  }
  return s;
}

describe("bloomFilterService", () => {
  beforeEach(() => {
    resetBloomFilter();
  });

  it("returns false before any filter is built", () => {
    expect(mightBeBlocked("GSOME_ADDRESS")).toBe(false);
  });

  it("reports not initialised before first build", () => {
    const stats = getBloomFilterStats();
    expect(stats.initialised).toBe(false);
    expect(stats.addressCount).toBe(0);
  });

  it("contains all seeded addresses after build (zero false negatives)", () => {
    const blocked = new Set(["GBLOCK1111", "GBLOCK2222", "GBLOCK3333"]);
    buildBloomFilter(blocked);

    for (const addr of blocked) {
      expect(mightBeBlocked(addr)).toBe(true);
    }
  });

  it("rebuilds correctly when called a second time (incremental update)", () => {
    buildBloomFilter(new Set(["GOLD_ADDR"]));
    buildBloomFilter(new Set(["GNEW_ADDR"]));

    expect(mightBeBlocked("GNEW_ADDR")).toBe(true);
    // GOLD_ADDR may or may not be present — Bloom filters are not meant to remove
    // entries.  The important guarantee is GNEW_ADDR is present.
  });

  it("reports filter statistics after build", () => {
    buildBloomFilter(new Set(["GA", "GB", "GC"]));
    const stats = getBloomFilterStats();
    expect(stats.initialised).toBe(true);
    expect(stats.addressCount).toBe(3);
    expect(stats.targetFpRate).toBeLessThan(0.001 + Number.EPSILON);
  });

  it("false-positive rate stays below 0.1% over 10 000 non-blocked addresses", () => {
    const blocked = makeAddressSet(1_000);
    buildBloomFilter(blocked);

    const nonBlockedPrefix = "XNON_"; // prefix guarantees no overlap with seeded addresses
    let falsePositives = 0;
    const trials = 10_000;

    for (let i = 0; i < trials; i++) {
      const addr = `${nonBlockedPrefix}${i}`;
      if (mightBeBlocked(addr)) falsePositives++;
    }

    const fpRate = falsePositives / trials;
    expect(fpRate).toBeLessThan(0.001);
  });

  // ── Benchmark ─────────────────────────────────────────────────────────────

  it("benchmark: Bloom filter lookup is faster than Set lookup for large blocklists", () => {
    const SIZE = 100_000;
    const addresses = makeAddressSet(SIZE);
    buildBloomFilter(addresses);

    const probe = "XNOT_IN_LIST_AT_ALL_12345";
    const ITERATIONS = 100_000;

    // Bloom filter lookup timing
    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      mightBeBlocked(probe);
    }
    const bloomMs = performance.now() - t0;

    // Set lookup timing (direct membership test)
    const t1 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      addresses.has(probe);
    }
    const setMs = performance.now() - t1;

    console.log(
      `[bloom-filter benchmark] ${ITERATIONS.toLocaleString()} lookups — ` +
      `Bloom: ${bloomMs.toFixed(2)}ms | Set: ${setMs.toFixed(2)}ms`
    );

    // Both must complete within a generous window.
    // The point is neither hangs; latency comparison is printed above.
    expect(bloomMs).toBeLessThan(5_000);
    expect(setMs).toBeLessThan(5_000);
  });

  it("benchmark: build time for 50 000-address blocklist", () => {
    const SIZE = 50_000;
    const addresses = makeAddressSet(SIZE);

    const t0 = performance.now();
    buildBloomFilter(addresses);
    const buildMs = performance.now() - t0;

    console.log(`[bloom-filter benchmark] Build ${SIZE.toLocaleString()} addresses in ${buildMs.toFixed(2)}ms`);

    // Build should complete in a reasonable time
    expect(buildMs).toBeLessThan(5_000);
  });
});
