/**
 * Cross-browser Compatibility Testing Service
 *
 * The Paymaster server API serves browser-based clients. This module:
 *
 *   1. Parses incoming User-Agent strings to identify browser family, version,
 *      and engine (Gecko / Blink / WebKit).
 *   2. Checks the identified browser against a configurable compatibility
 *      matrix (default: Legacy Safari ≥ 11, Firefox ESR ≥ 78, Chrome ≥ 90,
 *      Edge ≥ 90).
 *   3. Provides a middleware factory that logs incompatible clients and,
 *      optionally, rejects them with a structured 400 response.
 *   4. Collects telemetry (browser breakdown, compatibility rate) for the
 *      admin analytics panel.
 *
 * NOTE: UA sniffing is inherently imperfect. This module is intentionally
 * conservative: an unrecognized UA is treated as *compatible* so that novel
 * browsers (headless, non-browser API clients) are never blocked by default.
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "cross_browser_compat" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrowserFamily =
  | "chrome"
  | "firefox"
  | "safari"
  | "edge"
  | "ie"
  | "opera"
  | "unknown";

export type EngineFamily = "gecko" | "blink" | "webkit" | "trident" | "unknown";

export interface ParsedUserAgent {
  family: BrowserFamily;
  engine: EngineFamily;
  /** Major version number, or -1 if undetectable. */
  majorVersion: number;
  /** Full version string, e.g. "15.6". */
  version: string;
  /** Raw User-Agent string. */
  raw: string;
  /** True for non-browser clients (curl, Node.js, server-to-server). */
  isBot: boolean;
}

export interface BrowserConstraint {
  family: BrowserFamily;
  /** Minimum supported major version (inclusive). */
  minVersion: number;
}

export interface CompatibilityMatrix {
  /** Browsers in this list must meet their minVersion. */
  supported: BrowserConstraint[];
  /**
   * If true, browsers NOT in the supported list are accepted.
   * If false, only browsers explicitly listed are accepted.
   * Default: true (open policy).
   */
  allowUnknown?: boolean;
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  ua: ParsedUserAgent;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Default compatibility matrix
// ---------------------------------------------------------------------------

export const DEFAULT_MATRIX: CompatibilityMatrix = {
  allowUnknown: true,
  supported: [
    { family: "chrome",  minVersion: 90  },
    { family: "firefox", minVersion: 78  }, // Firefox ESR 78+
    { family: "safari",  minVersion: 11  }, // Legacy Safari 11+
    { family: "edge",    minVersion: 90  },
    { family: "opera",   minVersion: 70  },
  ],
};

// ---------------------------------------------------------------------------
// UA parsing
// ---------------------------------------------------------------------------

/**
 * Lightweight User-Agent parser — no external dependencies.
 *
 * Order of detection matters: Chrome UA strings also contain "Safari",
 * Edge UA strings also contain "Chrome", etc., so we check most-specific first.
 */
export function parseUserAgent(uaString: string): ParsedUserAgent {
  const ua = uaString ?? "";
  const lower = ua.toLowerCase();

  const result: ParsedUserAgent = {
    family: "unknown",
    engine: "unknown",
    majorVersion: -1,
    version: "",
    raw: ua,
    isBot: false,
  };

  // Bot / crawler detection
  if (/bot|crawl|spider|curl|python-requests|node-fetch|axios|okhttp/i.test(ua)) {
    result.isBot = true;
    return result;
  }

  // ── Edge (must come before Chrome) ──────────────────────────────────────
  const edgeMatch = ua.match(/Edg\/(\d+)\.(\d+)/);
  if (edgeMatch) {
    result.family = "edge";
    result.engine = "blink";
    result.majorVersion = parseInt(edgeMatch[1], 10);
    result.version = `${edgeMatch[1]}.${edgeMatch[2]}`;
    return result;
  }

  // Legacy Edge (EdgeHTML)
  const edgeHTMLMatch = ua.match(/Edge\/(\d+)\.(\d+)/);
  if (edgeHTMLMatch) {
    result.family = "edge";
    result.engine = "blink";
    result.majorVersion = parseInt(edgeHTMLMatch[1], 10);
    result.version = `${edgeHTMLMatch[1]}.${edgeHTMLMatch[2]}`;
    return result;
  }

  // ── Opera (must come before Chrome) ─────────────────────────────────────
  const operaMatch = ua.match(/OPR\/(\d+)\.(\d+)/);
  if (operaMatch) {
    result.family = "opera";
    result.engine = "blink";
    result.majorVersion = parseInt(operaMatch[1], 10);
    result.version = `${operaMatch[1]}.${operaMatch[2]}`;
    return result;
  }

  // ── Chrome / Chromium (must come before Safari) ──────────────────────────
  const chromeMatch = ua.match(/Chrome\/(\d+)\.(\d+)/);
  if (chromeMatch && !lower.includes("edg/") && !lower.includes("opr/")) {
    result.family = "chrome";
    result.engine = "blink";
    result.majorVersion = parseInt(chromeMatch[1], 10);
    result.version = `${chromeMatch[1]}.${chromeMatch[2]}`;
    return result;
  }

  // ── Firefox ──────────────────────────────────────────────────────────────
  const firefoxMatch = ua.match(/Firefox\/(\d+)\.(\d+)/);
  if (firefoxMatch) {
    result.family = "firefox";
    result.engine = "gecko";
    result.majorVersion = parseInt(firefoxMatch[1], 10);
    result.version = `${firefoxMatch[1]}.${firefoxMatch[2]}`;
    return result;
  }

  // ── Internet Explorer ─────────────────────────────────────────────────────
  const ieMatch = ua.match(/MSIE (\d+)\.\d+/);
  const ieTridentMatch = ua.match(/Trident\/.*rv:(\d+)\.\d+/);
  if (ieMatch || ieTridentMatch) {
    const vStr = (ieMatch?.[1] ?? ieTridentMatch?.[1]) ?? "0";
    result.family = "ie";
    result.engine = "trident";
    result.majorVersion = parseInt(vStr, 10);
    result.version = vStr;
    return result;
  }

  // ── Safari (must come after Chrome to avoid false positives) ─────────────
  const safariMatch = ua.match(/Version\/(\d+)\.(\d+).*Safari/);
  if (safariMatch) {
    result.family = "safari";
    result.engine = "webkit";
    result.majorVersion = parseInt(safariMatch[1], 10);
    result.version = `${safariMatch[1]}.${safariMatch[2]}`;
    return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Compatibility check
// ---------------------------------------------------------------------------

/**
 * Check whether a parsed UA is compatible with the given matrix.
 */
export function checkCompatibility(
  ua: ParsedUserAgent,
  matrix: CompatibilityMatrix = DEFAULT_MATRIX,
): CompatibilityCheckResult {
  let result: CompatibilityCheckResult;

  // Bots are never blocked regardless of matrix settings
  if (ua.isBot) {
    result = { compatible: true, ua };
  } else if (ua.family === "unknown") {
    // Unknown families are allowed unless the matrix explicitly disallows them
    const compatible = matrix.allowUnknown !== false;
    result = {
      compatible,
      ua,
      reason: compatible
        ? undefined
        : `Browser family "unknown" is not in the supported list.`,
    };
  } else if (ua.family === "ie") {
    // IE is always incompatible (it cannot run modern ES2020+/WASM)
    result = {
      compatible: false,
      ua,
      reason: `Internet Explorer ${ua.majorVersion} is not supported. Please upgrade to a modern browser.`,
    };
  } else {
    const constraint = matrix.supported.find((c) => c.family === ua.family);

    if (!constraint) {
      const compatible = matrix.allowUnknown !== false;
      result = {
        compatible,
        ua,
        reason: compatible
          ? undefined
          : `Browser family "${ua.family}" is not in the supported list.`,
      };
    } else if (ua.majorVersion !== -1 && ua.majorVersion < constraint.minVersion) {
      result = {
        compatible: false,
        ua,
        reason: `${ua.family} ${ua.majorVersion} is below the minimum required version ${constraint.minVersion}.`,
      };
    } else {
      result = { compatible: true, ua };
    }
  }

  recordTelemetry(result);
  return result;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface BrowserTelemetry {
  total: number;
  compatible: number;
  incompatible: number;
  byFamily: Record<BrowserFamily, number>;
  byVersion: Record<string, number>;
}

const _telemetry: BrowserTelemetry = {
  total: 0,
  compatible: 0,
  incompatible: 0,
  byFamily: {
    chrome: 0, firefox: 0, safari: 0, edge: 0,
    ie: 0, opera: 0, unknown: 0,
  },
  byVersion: {},
};

function recordTelemetry(result: CompatibilityCheckResult): void {
  _telemetry.total++;
  if (result.compatible) {
    _telemetry.compatible++;
  } else {
    _telemetry.incompatible++;
  }

  _telemetry.byFamily[result.ua.family] =
    (_telemetry.byFamily[result.ua.family] ?? 0) + 1;

  if (result.ua.version) {
    const key = `${result.ua.family}/${result.ua.version}`;
    _telemetry.byVersion[key] = (_telemetry.byVersion[key] ?? 0) + 1;
  }
}

export function getTelemetry(): Readonly<BrowserTelemetry> {
  return { ..._telemetry, byFamily: { ..._telemetry.byFamily } };
}

export function resetTelemetry(): void {
  _telemetry.total = 0;
  _telemetry.compatible = 0;
  _telemetry.incompatible = 0;
  Object.keys(_telemetry.byFamily).forEach(
    (k) => ((_telemetry.byFamily as any)[k] = 0),
  );
  _telemetry.byVersion = {};
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

export interface CrossBrowserMiddlewareOptions {
  /** Compatibility matrix. Defaults to DEFAULT_MATRIX. */
  matrix?: CompatibilityMatrix;
  /**
   * When true, reject incompatible browsers with 400.
   * When false (default), log only.
   */
  strict?: boolean;
}

/**
 * Returns an Express middleware that checks the request's User-Agent against
 * the compatibility matrix.
 *
 * In strict mode, incompatible browsers receive:
 *   400 { error: "browser_incompatible", message: "...", browser: {...} }
 *
 * In permissive mode (default), the check is logged but the request continues.
 *
 * In both modes `req.browserUA` is set to the parsed UA for downstream use.
 */
export function crossBrowserCompatMiddleware(
  options: CrossBrowserMiddlewareOptions = {},
) {
  const matrix = options.matrix ?? DEFAULT_MATRIX;
  const strict = options.strict ?? false;

  return (req: Request, res: Response, next: NextFunction): void => {
    const uaString = req.headers["user-agent"] ?? "";
    const ua = parseUserAgent(uaString);
    const result = checkCompatibility(ua, matrix);

    // Attach to request for downstream handlers
    (req as any).browserUA = ua;

    if (!result.compatible) {
      logger.warn(
        {
          family: ua.family,
          version: ua.version,
          reason: result.reason,
          ip: req.ip,
          path: req.path,
        },
        "Incompatible browser detected",
      );

      if (strict) {
        res.status(400).json({
          error: "browser_incompatible",
          message: result.reason,
          browser: { family: ua.family, version: ua.version },
        });
        return;
      }
    }

    next();
  };
}
