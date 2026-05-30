import { BloomFilter } from "bloom-filters";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "bloom_filter" });

/**
 * Target false-positive rate.  < 0.1% as required by the acceptance criteria.
 */
const TARGET_FP_RATE = 0.001;

/**
 * Minimum capacity to seed the filter with even when the blocklist is small,
 * so the filter isn't over-compressed during early startup.
 */
const MIN_CAPACITY = 10_000;

let filter: BloomFilter | null = null;
let filterSize = 0;

/**
 * Build (or rebuild) the Bloom filter from a set of addresses.
 *
 * Called on startup and whenever the blocklist is updated.
 */
export function buildBloomFilter(addresses: Set<string>): void {
  const capacity = Math.max(addresses.size, MIN_CAPACITY);
  const newFilter = BloomFilter.create(capacity, TARGET_FP_RATE);

  for (const addr of addresses) {
    newFilter.add(addr);
  }

  filter = newFilter;
  filterSize = addresses.size;

  logger.info(
    {
      address_count: filterSize,
      capacity,
      fp_rate: TARGET_FP_RATE,
    },
    "Bloom filter built"
  );
}

/**
 * O(1) probabilistic membership test.
 *
 * Returns true  → address is PROBABLY in the blocklist (may false-positive at < 0.1%).
 * Returns false → address is DEFINITELY NOT in the blocklist.
 *
 * Falls back to false (allow) if the filter has not been initialised yet,
 * which matches the fail-open behaviour of the OFAC screening module.
 */
export function mightBeBlocked(address: string): boolean {
  if (!filter) return false;
  return filter.has(address);
}

/**
 * Returns diagnostic information about the current filter state.
 */
export function getBloomFilterStats(): {
  initialised: boolean;
  addressCount: number;
  targetFpRate: number;
} {
  return {
    initialised: filter !== null,
    addressCount: filterSize,
    targetFpRate: TARGET_FP_RATE,
  };
}

/**
 * Reset the filter (useful in tests).
 */
export function resetBloomFilter(): void {
  filter = null;
  filterSize = 0;
}
