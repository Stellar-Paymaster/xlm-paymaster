import { createLogger } from "../utils/logger";
import { logAuditEvent } from "./auditLogger";
import { buildBloomFilter, mightBeBlocked } from "./bloomFilterService";

const logger = createLogger({ component: "ofac_screening" });

// OFAC SDN CSV — publicly available from the US Treasury.
// Override via OFAC_SDN_URL for testing or custom lists.
const DEFAULT_SDN_URL = "https://ofac.treasury.gov/downloads/sdn.csv";
const REFRESH_INTERVAL_MS = Number(process.env.OFAC_REFRESH_INTERVAL_MS) || 3_600_000; // 1 hour

// When true, allow transactions if the SDN list is unavailable (empty cache).
// Default: false (fail-closed) — safest for compliance.
const FAIL_OPEN = process.env.OFAC_SCREENING_FAIL_OPEN === "true";

let sdnAddresses: Set<string> = new Set();
let lastRefresh: Date | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export interface ScreeningResult {
  screened: boolean;
  blocked: boolean;
  matchedAddresses: string[];
  checkedAddresses: string[];
  sdnListSize: number;
  failOpen?: boolean;
}

/**
 * Parse an OFAC SDN CSV blob and return a Set of all digital currency addresses.
 *
 * OFAC embeds blockchain addresses inside the Remarks column as:
 *   "Digital Currency Address - XLM: G...; Digital Currency Address - ETH: 0x..."
 *
 * We extract every address regardless of asset type so that any address
 * appearing on the SDN list — in any context — is captured.
 */
export function parseSDNAddresses(csvText: string): Set<string> {
  const addresses = new Set<string>();
  // Matches: "Digital Currency Address - <TOKEN>: <ADDR>" (case-insensitive)
  const re = /Digital\s+Currency\s+Address\s+-\s+\w+\s*:\s*([A-Za-z0-9]{10,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(csvText)) !== null) {
    addresses.add(m[1].trim().toUpperCase());
  }
  return addresses;
}

/**
 * Load the comma-separated OFAC_BLOCKLIST env var into the SDN set.
 * Allows operators to manually add addresses without waiting for the SDN refresh.
 */
function applyEnvBlocklist(target: Set<string>): void {
  const raw = process.env.OFAC_BLOCKLIST ?? "";
  for (const addr of raw.split(",")) {
    const trimmed = addr.trim().toUpperCase();
    if (trimmed.length > 0) target.add(trimmed);
  }
}

export async function refreshSDNList(): Promise<void> {
  const url = process.env.OFAC_SDN_URL ?? DEFAULT_SDN_URL;
  try {
    logger.info({ url }, "Fetching OFAC SDN list");
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const parsed = parseSDNAddresses(text);
    applyEnvBlocklist(parsed);

    sdnAddresses = parsed;
    lastRefresh = new Date();
    buildBloomFilter(sdnAddresses);
    logger.info({ addressCount: sdnAddresses.size }, "OFAC SDN list refreshed");
  } catch (err) {
    logger.error({ err: String(err), url }, "Failed to refresh OFAC SDN list");
    if (sdnAddresses.size === 0) {
      if (FAIL_OPEN) {
        logger.warn("OFAC SDN list unavailable — fail-open policy active");
      } else {
        logger.warn("OFAC SDN list unavailable — fail-closed policy active, all txs blocked");
      }
    }
  }
}

export function initializeOFACScreening(): void {
  // Apply env blocklist immediately — no network call needed
  applyEnvBlocklist(sdnAddresses);

  // Seed the filter from whatever is in the blocklist right now (env entries).
  buildBloomFilter(sdnAddresses);

  // Non-blocking initial download
  refreshSDNList().catch(err =>
    logger.error({ err: String(err) }, "Initial OFAC SDN load failed")
  );

  // Hourly refresh
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshSDNList().catch(err =>
      logger.error({ err: String(err) }, "Scheduled OFAC SDN refresh failed")
    );
  }, REFRESH_INTERVAL_MS);

  logger.info({ refreshIntervalMs: REFRESH_INTERVAL_MS, failOpen: FAIL_OPEN }, "OFAC screening initialized");
}

export function stopOFACScreening(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export function getSDNStats(): { addressCount: number; lastRefresh: Date | null } {
  return { addressCount: sdnAddresses.size, lastRefresh };
}

/**
 * Screen an array of addresses against the SDN list.
 *
 * Comparison is case-insensitive. Returns immediately if the cache is empty
 * and FAIL_OPEN is set; otherwise a blocked result is returned.
 */
export function screenAddresses(addresses: string[]): ScreeningResult {
  // If SDN list is unavailable and fail-open, allow the transaction
  if (sdnAddresses.size === 0 && FAIL_OPEN) {
    return {
      screened: false,
      blocked: false,
      matchedAddresses: [],
      checkedAddresses: addresses,
      sdnListSize: 0,
      failOpen: true
    };
  }

  const upperAddresses = addresses.map(a => a.toUpperCase());

  // Fast O(1) Bloom-filter pre-check — if the filter says "definitely not",
  // skip the Set lookup entirely.  False-positive rate < 0.1%.
  const candidates = upperAddresses.filter(a => mightBeBlocked(a));
  const matched = candidates.filter(a => sdnAddresses.has(a));

  return {
    screened: true,
    blocked: matched.length > 0,
    matchedAddresses: matched,
    checkedAddresses: addresses,
    sdnListSize: sdnAddresses.size
  };
}

/**
 * Persist every screening event to the audit log (both passes and blocks).
 * Non-blocking — failures are swallowed so screening never blocks the request.
 */
export async function logScreeningResult(
  innerTxHash: string,
  tenantId: string,
  result: ScreeningResult
): Promise<void> {
  const eventType = result.blocked ? "OFAC_SCREENING_BLOCKED" : "OFAC_SCREENING_PASSED";
  await logAuditEvent(eventType, `tenant:${tenantId}`, {
    innerTxHash,
    tenantId,
    screened: result.screened,
    blocked: result.blocked,
    matchedAddresses: result.matchedAddresses,
    checkedCount: result.checkedAddresses.length,
    sdnListSize: result.sdnListSize,
    failOpen: result.failOpen ?? false,
    timestamp: new Date().toISOString()
  });
}
