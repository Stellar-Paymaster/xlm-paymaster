import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRedisOptions, type RedisFactoryEnv } from "./redisClientFactory";

const forge = require("node-forge");

let caPath: string;
let clientCertPath: string;
let clientKeyPath: string;
let tmpDir: string;

function createSelfSignedCa(commonName: string): {
  certPem: string;
  keyPem: string;
} {
  const keyPair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: "basicConstraints", cA: true }]);
  cert.sign(keyPair.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
  };
}

beforeAll(() => {
  // Generate a self-signed CA + client material once and persist to disk so the
  // factory exercises the same readFileSync path it uses in production.
  tmpDir = mkdtempSync(join(tmpdir(), "redis-tls-"));
  const ca = createSelfSignedCa("Fluid Local Redis CA");
  const client = createSelfSignedCa("fluid-redis-client");

  caPath = join(tmpDir, "ca.pem");
  clientCertPath = join(tmpDir, "client.pem");
  clientKeyPath = join(tmpDir, "client.key");

  writeFileSync(caPath, ca.certPem);
  writeFileSync(clientCertPath, client.certPem);
  writeFileSync(clientKeyPath, client.keyPem);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("buildRedisOptions — production TLS enforcement", () => {
  it("rejects a plaintext redis:// URL in production", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "production",
      REDIS_URL: "redis://redis.internal:6379",
      REDIS_TLS_CA_PATH: caPath,
    };
    expect(() => buildRedisOptions(env)).toThrow(/requires a TLS connection/i);
  });

  it("rejects a rediss:// URL in production without a CA path", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "production",
      REDIS_URL: "rediss://redis.internal:6379",
    };
    expect(() => buildRedisOptions(env)).toThrow(/certificate authority/i);
  });

  it("loads the CA and enforces verification for a production rediss:// URL", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "production",
      REDIS_URL: "rediss://redis.internal:6379",
      REDIS_TLS_CA_PATH: caPath,
    };
    const { url, options } = buildRedisOptions(env);
    expect(url).toBe("rediss://redis.internal:6379");
    expect(options.tls).toBeDefined();
    expect(options.tls?.ca).toBeInstanceOf(Buffer);
    expect(options.tls?.rejectUnauthorized).toBe(true);
  });

  it("ignores the reject-unauthorized opt-out in production", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "production",
      REDIS_URL: "rediss://redis.internal:6379",
      REDIS_TLS_CA_PATH: caPath,
      REDIS_TLS_REJECT_UNAUTHORIZED: "false",
    };
    const { options } = buildRedisOptions(env);
    expect(options.tls?.rejectUnauthorized).toBe(true);
  });

  it("loads client material for mutual TLS", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "production",
      REDIS_URL: "rediss://redis.internal:6379",
      REDIS_TLS_CA_PATH: caPath,
      REDIS_TLS_CERT_PATH: clientCertPath,
      REDIS_TLS_KEY_PATH: clientKeyPath,
    };
    const { options } = buildRedisOptions(env);
    expect(options.tls?.cert).toBeInstanceOf(Buffer);
    expect(options.tls?.key).toBeInstanceOf(Buffer);
  });

  it("rejects a half-configured mutual TLS setup", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "production",
      REDIS_URL: "rediss://redis.internal:6379",
      REDIS_TLS_CA_PATH: caPath,
      REDIS_TLS_CERT_PATH: clientCertPath,
    };
    expect(() => buildRedisOptions(env)).toThrow(/Mutual TLS requires both/i);
  });
});

describe("buildRedisOptions — local development", () => {
  it("allows a plaintext redis:// URL", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "development",
      REDIS_URL: "redis://127.0.0.1:6379",
    };
    const { url, options } = buildRedisOptions(env);
    expect(url).toBe("redis://127.0.0.1:6379");
    expect(options.tls).toBeUndefined();
  });

  it("falls back to the localhost URL when REDIS_URL is unset", () => {
    const { url, options } = buildRedisOptions({ NODE_ENV: "test" });
    expect(url).toBe("redis://127.0.0.1:6379");
    expect(options.tls).toBeUndefined();
  });

  it("supports a self-signed CA over rediss:// with a servername override", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "development",
      REDIS_URL: "rediss://127.0.0.1:6379",
      REDIS_TLS_CA_PATH: caPath,
      REDIS_TLS_SERVERNAME: "localhost",
    };
    const { options } = buildRedisOptions(env);
    expect(options.tls?.ca).toBeInstanceOf(Buffer);
    expect(options.tls?.servername).toBe("localhost");
    expect(options.tls?.rejectUnauthorized).toBe(true);
  });

  it("allows skipping verification for an untrusted self-signed cert locally", () => {
    const env: RedisFactoryEnv = {
      NODE_ENV: "development",
      REDIS_URL: "rediss://127.0.0.1:6379",
      REDIS_TLS_REJECT_UNAUTHORIZED: "false",
    };
    const { options } = buildRedisOptions(env);
    expect(options.tls?.rejectUnauthorized).toBe(false);
  });
});
