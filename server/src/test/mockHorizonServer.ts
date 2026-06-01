/**
 * Mock Horizon Server — Overhauled
 *
 * A realistic in-process HTTP mock for the Stellar Horizon API. Designed for
 * integration and unit tests that need to exercise:
 *
 *  • Happy-path responses (submit success, account fetch, fee stats, ledgers)
 *  • Realistic error simulations:
 *      - 429 rate-limit with Retry-After header
 *      - 500 internal server error (transient)
 *      - 502 bad gateway
 *      - 503 service unavailable
 *      - 504 gateway timeout (full TCP stall or response delay)
 *      - tx_bad_seq / tx_insufficient_fee / tx_failed Horizon extras
 *  • Network-level failures (connection reset, ETIMEDOUT)
 *  • Configurable latency injection
 *  • Request capture for assertion in tests
 *
 * Usage
 * ─────
 *   const server = new MockHorizonServer();
 *   const { url } = await server.start();
 *   // … tests …
 *   await server.stop();
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "mock_horizon" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HorizonErrorScenario =
  | "none"
  | "rate_limit"          // 429 + Retry-After: 1
  | "internal_error"      // 500
  | "bad_gateway"         // 502
  | "service_unavailable" // 503
  | "gateway_timeout"     // 504 (delayed response)
  | "connection_reset"    // socket destroyed mid-request
  | "tx_bad_seq"          // 400 Horizon extras: tx_bad_seq
  | "tx_insufficient_fee" // 400 Horizon extras: tx_insufficient_fee
  | "tx_failed";          // 400 Horizon extras: tx_failed

export interface MockHorizonConfig {
  /** Default scenario applied to ALL requests (overridden by per-path config). */
  defaultScenario?: HorizonErrorScenario;
  /** Latency added to every response (ms). Default 0. */
  latencyMs?: number;
  /** Per-path overrides. Key is the request pathname, e.g. "/transactions". */
  pathScenarios?: Partial<Record<string, HorizonErrorScenario>>;
  /**
   * Number of requests after which the scenario resets to "none".
   * Useful for simulating a transient failure that resolves after N retries.
   * -1 = never reset (default).
   */
  failCount?: number;
}

export interface CapturedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Horizon response fixtures
// ---------------------------------------------------------------------------

function feeStatsResponse() {
  return {
    last_ledger: "123456",
    last_ledger_base_fee: "100",
    ledger_capacity_usage: "0.5",
    min_accepted_fee: "100",
    mode_accepted_fee: "150",
    p10_accepted_fee: "100",
    p20_accepted_fee: "110",
    p30_accepted_fee: "120",
    p40_accepted_fee: "130",
    p50_accepted_fee: "150",
    p60_accepted_fee: "160",
    p70_accepted_fee: "170",
    p80_accepted_fee: "200",
    p90_accepted_fee: "300",
    p95_accepted_fee: "400",
    p99_accepted_fee: "500",
  };
}

function accountResponse(accountId: string) {
  return {
    id: accountId,
    account_id: accountId,
    sequence: "100",
    balance: "1000.0000000",
    subentry_count: 0,
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
    balances: [{ balance: "1000.0000000", asset_type: "native" }],
    signers: [{ public_key: accountId, weight: 1, type: "ed25519_public_key" }],
    _links: {
      self: { href: `/accounts/${accountId}` },
      transactions: { href: `/accounts/${accountId}/transactions` },
    },
  };
}

function txSuccessResponse(hash: string = "abc123") {
  return {
    hash,
    ledger: 123456,
    envelope_xdr: "AAAA",
    result_xdr: "AAAA",
    result_meta_xdr: "AAAA",
    _links: { self: { href: `/transactions/${hash}` } },
  };
}

function txErrorExtras(resultCode: string) {
  return {
    type: "https://stellar.org/horizon-errors/transaction_failed",
    title: "Transaction Failed",
    status: 400,
    detail: "The transaction failed when tried to be applied on the stellar network.",
    extras: {
      envelope_xdr: "AAAA",
      result_codes: {
        transaction: resultCode,
        operations: [],
      },
      result_xdr: "AAAA",
    },
  };
}

function rateLimitResponse() {
  return {
    type: "https://stellar.org/horizon-errors/rate_limit_exceeded",
    title: "Rate Limit Exceeded",
    status: 429,
    detail: "You have made too many requests. Try again later.",
  };
}

function horizonErrorBody(status: number, title: string) {
  return {
    type: `https://stellar.org/horizon-errors/${title.toLowerCase().replace(/ /g, "_")}`,
    title,
    status,
    detail: `Mock ${title} error for testing.`,
  };
}

// ---------------------------------------------------------------------------
// MockHorizonServer
// ---------------------------------------------------------------------------

export class MockHorizonServer {
  private server: http.Server;
  private config: Required<MockHorizonConfig>;
  private requestLog: CapturedRequest[] = [];
  private failsRemaining: number;

  constructor(config: MockHorizonConfig = {}) {
    this.config = {
      defaultScenario: config.defaultScenario ?? "none",
      latencyMs: config.latencyMs ?? 0,
      pathScenarios: config.pathScenarios ?? {},
      failCount: config.failCount ?? -1,
    };
    this.failsRemaining = this.config.failCount;
    this.server = http.createServer(this._handleRequest.bind(this));
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<{ url: string; port: number }> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const { port } = this.server.address() as AddressInfo;
        const url = `http://127.0.0.1:${port}`;
        logger.debug({ url }, "MockHorizonServer started");
        resolve({ url, port });
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /** Reconfigure the mock at runtime (e.g., between test cases). */
  configure(patch: Partial<MockHorizonConfig>): void {
    if (patch.defaultScenario !== undefined)
      this.config.defaultScenario = patch.defaultScenario;
    if (patch.latencyMs !== undefined) this.config.latencyMs = patch.latencyMs;
    if (patch.pathScenarios !== undefined)
      this.config.pathScenarios = {
        ...this.config.pathScenarios,
        ...patch.pathScenarios,
      };
    if (patch.failCount !== undefined) {
      this.config.failCount = patch.failCount;
      this.failsRemaining = patch.failCount;
    }
  }

  /** Reset to default (no errors, no latency). */
  reset(): void {
    this.config.defaultScenario = "none";
    this.config.latencyMs = 0;
    this.config.pathScenarios = {};
    this.config.failCount = -1;
    this.failsRemaining = -1;
    this.requestLog = [];
  }

  // ── Request log ───────────────────────────────────────────────────────────

  /** All captured requests since last reset(). */
  get requests(): CapturedRequest[] {
    return [...this.requestLog];
  }

  lastRequest(): CapturedRequest | undefined {
    return this.requestLog[this.requestLog.length - 1];
  }

  clearRequests(): void {
    this.requestLog = [];
  }

  // ── Request handler ───────────────────────────────────────────────────────

  private async _handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const body = await this._readBody(req);
    const path = req.url?.split("?")[0] ?? "/";

    this.requestLog.push({
      method: req.method ?? "GET",
      path,
      headers: req.headers,
      body,
      timestamp: Date.now(),
    });

    // Inject latency
    if (this.config.latencyMs > 0) {
      await sleep(this.config.latencyMs);
    }

    // Determine the active scenario for this path
    const scenario = this._resolveScenario(path);

    // Handle fail-count auto-reset
    if (scenario !== "none" && this.config.failCount > 0) {
      if (this.failsRemaining > 0) {
        this.failsRemaining--;
        if (this.failsRemaining === 0) {
          this.config.defaultScenario = "none";
        }
      }
    }

    // Dispatch
    try {
      await this._dispatchScenario(scenario, path, req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    }
  }

  private _resolveScenario(path: string): HorizonErrorScenario {
    return (this.config.pathScenarios[path] as HorizonErrorScenario | undefined)
      ?? this.config.defaultScenario;
  }

  private async _dispatchScenario(
    scenario: HorizonErrorScenario,
    path: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
  ): Promise<void> {
    switch (scenario) {
      case "rate_limit":
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "1",
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 1),
        });
        return res.end(JSON.stringify(rateLimitResponse()));

      case "internal_error":
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(horizonErrorBody(500, "Internal Server Error")));

      case "bad_gateway":
        res.writeHead(502, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(horizonErrorBody(502, "Bad Gateway")));

      case "service_unavailable":
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Retry-After": "5",
        });
        return res.end(
          JSON.stringify(horizonErrorBody(503, "Service Unavailable")),
        );

      case "gateway_timeout": {
        // Simulate 504: respond after a long delay — tests use a short timeout
        const delay = this.config.latencyMs > 0 ? this.config.latencyMs : 5_000;
        await sleep(delay);
        res.writeHead(504, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(horizonErrorBody(504, "Gateway Timeout")));
      }

      case "connection_reset":
        // Abruptly destroy the socket without sending a response
        req.socket.destroy(new Error("ECONNRESET"));
        return;

      case "tx_bad_seq":
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(txErrorExtras("tx_bad_seq")));

      case "tx_insufficient_fee":
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(txErrorExtras("tx_insufficient_fee")));

      case "tx_failed":
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(txErrorExtras("tx_failed")));

      default:
        return this._handleHappyPath(path, req, res, body);
    }
  }

  private _handleHappyPath(
    path: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
  ): void {
    res.setHeader("Content-Type", "application/json");

    if (path === "/fee_stats") {
      res.writeHead(200);
      return res.end(JSON.stringify(feeStatsResponse()));
    }

    if (path.startsWith("/accounts/")) {
      const accountId = decodeURIComponent(path.replace("/accounts/", "").split("/")[0]);
      res.writeHead(200);
      return res.end(JSON.stringify(accountResponse(accountId)));
    }

    if (path === "/transactions" && req.method === "POST") {
      res.writeHead(200);
      return res.end(JSON.stringify(txSuccessResponse()));
    }

    if (path.startsWith("/transactions/")) {
      const hash = path.replace("/transactions/", "");
      res.writeHead(200);
      return res.end(JSON.stringify(txSuccessResponse(hash)));
    }

    if (path === "/ledgers" || path.startsWith("/ledgers/")) {
      res.writeHead(200);
      return res.end(
        JSON.stringify({
          _embedded: {
            records: [
              { sequence: 123456, closed_at: new Date().toISOString(), base_fee_in_stroops: 100 },
            ],
          },
        }),
      );
    }

    // Fallback 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ type: "not_found", status: 404, title: "Resource Not Found" }));
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", () => resolve(""));
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
