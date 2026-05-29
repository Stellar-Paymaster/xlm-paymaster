import { readFileSync } from "fs";
import type { ConnectionOptions as TlsConnectionOptions } from "tls";
import Redis, { type RedisOptions } from "ioredis";

/**
 * Centralised ioredis client factory.
 *
 * API metrics and rate-limit counters travel over Redis between services, so
 * the transport must be encrypted in production. This factory enforces two
 * production invariants:
 *
 *   1. The connection URL MUST use the TLS `rediss://` scheme. A plaintext
 *      `redis://` URL is rejected so metrics are never sent in the clear.
 *   2. A certificate authority MUST be supplied (`REDIS_TLS_CA_PATH`) and
 *      server certificates are always verified against it
 *      (`rejectUnauthorized: true`, never disabled in production).
 *
 * In non-production profiles the factory stays permissive: plaintext
 * `redis://` is allowed, and developers can point `REDIS_TLS_CA_PATH` at a
 * self-signed CA (optionally overriding `REDIS_TLS_SERVERNAME`) to exercise the
 * encrypted path locally.
 */

export interface RedisFactoryEnv {
  NODE_ENV?: string;
  REDIS_URL?: string;
  /** PEM file containing the CA used to verify the Redis server certificate. */
  REDIS_TLS_CA_PATH?: string;
  /** Optional client certificate PEM for mutual TLS. */
  REDIS_TLS_CERT_PATH?: string;
  /** Optional client private key PEM for mutual TLS. */
  REDIS_TLS_KEY_PATH?: string;
  /**
   * Optional SNI / certificate hostname override. Useful for local self-signed
   * certificates issued for a name other than the connection host (e.g. when
   * connecting to 127.0.0.1 with a cert issued for "localhost").
   */
  REDIS_TLS_SERVERNAME?: string;
  /**
   * Escape hatch for local development ONLY. Set to "false" to skip CA
   * verification against an untrusted self-signed certificate. Ignored in
   * production, where verification is mandatory.
   */
  REDIS_TLS_REJECT_UNAUTHORIZED?: string;
}

const DEFAULT_LOCAL_URL = "redis://127.0.0.1:6379";

function isProduction(env: RedisFactoryEnv): boolean {
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function parseScheme(url: string): string {
  // Tolerate URLs the WHATWG parser rejects (e.g. unusual auth chars) by
  // falling back to a simple scheme split.
  try {
    return new URL(url).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    const idx = url.indexOf("://");
    return idx === -1 ? "" : url.slice(0, idx).toLowerCase();
  }
}

/**
 * Resolve the effective connection URL and ioredis options for the current
 * environment, applying and validating the production TLS policy.
 *
 * Throws when the environment violates the production invariants so the
 * process fails fast at startup rather than silently sending metrics in the
 * clear.
 */
export function buildRedisOptions(env: RedisFactoryEnv = process.env): {
  url: string;
  options: RedisOptions;
} {
  const production = isProduction(env);
  const url = env.REDIS_URL?.trim() || DEFAULT_LOCAL_URL;
  const scheme = parseScheme(url);
  const isTls = scheme === "rediss";

  if (production && !isTls) {
    throw new Error(
      "[Redis] Production requires a TLS connection. Set REDIS_URL to a " +
        `rediss:// endpoint (received scheme "${scheme || "<none>"}").`,
    );
  }

  // Plaintext connection outside production — no TLS material to assemble.
  if (!isTls) {
    return { url, options: {} };
  }

  const tls: TlsConnectionOptions = {};

  const caPath = env.REDIS_TLS_CA_PATH?.trim();
  if (caPath) {
    tls.ca = readFileSync(caPath);
  } else if (production) {
    throw new Error(
      "[Redis] Production TLS requires a certificate authority. Set " +
        "REDIS_TLS_CA_PATH to the PEM file used to verify the Redis server.",
    );
  }

  // Optional mutual TLS — load both halves together or neither.
  const certPath = env.REDIS_TLS_CERT_PATH?.trim();
  const keyPath = env.REDIS_TLS_KEY_PATH?.trim();
  if (certPath || keyPath) {
    if (!certPath || !keyPath) {
      throw new Error(
        "[Redis] Mutual TLS requires both REDIS_TLS_CERT_PATH and " +
          "REDIS_TLS_KEY_PATH to be set.",
      );
    }
    tls.cert = readFileSync(certPath);
    tls.key = readFileSync(keyPath);
  }

  const servername = env.REDIS_TLS_SERVERNAME?.trim();
  if (servername) {
    tls.servername = servername;
  }

  // Certificate authority verification is mandatory in production and on by
  // default everywhere. Only an explicit, non-production opt-out can disable it
  // for local self-signed testing.
  if (production) {
    tls.rejectUnauthorized = true;
  } else {
    tls.rejectUnauthorized =
      env.REDIS_TLS_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false";
  }

  return { url, options: { tls } };
}

/**
 * Create an ioredis client with the environment's TLS policy applied.
 *
 * @param env Environment source (defaults to `process.env`). Primarily an
 *   injection point for tests.
 */
export function createRedisClient(env: RedisFactoryEnv = process.env): Redis {
  const { url, options } = buildRedisOptions(env);
  return new Redis(url, options);
}

export default createRedisClient;
