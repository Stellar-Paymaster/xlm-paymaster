import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sanitise, hashXdr, truncatePublicKey } from "./sanitise";

describe("PII Masking and Redaction", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, MASK_LOGS: "true" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("truncates Stellar public keys correctly", () => {
    const pubKey = "GA2C5RFPE6GCKIG3EQEIM3JYZMQHQ644QMM3UKZ2UXDZY6R5DB5R45E6";
    const truncated = truncatePublicKey(pubKey);
    expect(truncated).toBe("GA2C...45E6");
  });

  it("hashes raw XDR strings correctly", () => {
    const xdr = "AAAAAgAAAAB...";
    const hashed = hashXdr(xdr);
    expect(hashed).toMatch(/^XDR:[a-f0-9]{64}$/);
  });

  it("sanitise() utility redacts secrets, keys, and tokens", () => {
    const payload = {
      userToken: "super-secret-token",
      apiKey: "sk_live_123456",
      clientSecret: "my-secret",
      normalField: "hello world",
      nested: {
        token: "nested-token",
        publicKey: "GA2C5RFPE6GCKIG3EQEIM3JYZMQHQ644QMM3UKZ2UXDZY6R5DB5R45E6",
        rawXdr: "AAAAAgAAAAB..."
      }
    };

    const result = sanitise(payload);
    
    expect(result.userToken).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.clientSecret).toBe("[REDACTED]");
    expect(result.normalField).toBe("hello world");
    
    expect(result.nested.token).toBe("[REDACTED]");
    expect(result.nested.publicKey).toBe("GA2C...45E6");
    expect(result.nested.rawXdr).toMatch(/^XDR:[a-f0-9]{64}$/);
  });

  it("skips masking when MASK_LOGS=false", () => {
    process.env.MASK_LOGS = "false";
    
    const payload = {
      apiKey: "sk_live_123456",
      publicKey: "GA2C5RFPE6GCKIG3EQEIM3JYZMQHQ644QMM3UKZ2UXDZY6R5DB5R45E6"
    };

    const result = sanitise(payload);
    expect(result.apiKey).toBe("sk_live_123456");
    expect(result.publicKey).toBe("GA2C5RFPE6GCKIG3EQEIM3JYZMQHQ644QMM3UKZ2UXDZY6R5DB5R45E6");
  });
});