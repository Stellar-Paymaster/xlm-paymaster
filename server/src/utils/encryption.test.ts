import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encrypt, decrypt, getEncryptionKey } from "./encryption";

describe("Database Encryption at Rest (TDE)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use development key if DATABASE_ENCRYPTION_KEY is not set in dev", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_ENCRYPTION_KEY;
    const key = getEncryptionKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("should throw error if DATABASE_ENCRYPTION_KEY is not set in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_ENCRYPTION_KEY;
    expect(() => getEncryptionKey()).toThrow(/required in production/);
  });

  it("should successfully encrypt and decrypt a string with AES-256-GCM", () => {
    const originalText = "my-super-secret-value";
    const encrypted = encrypt(originalText);
    
    expect(encrypted).not.toBe(originalText);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(originalText);
  });

  it("should return the original text if it is not encrypted", () => {
    const plainText = "not-encrypted-text";
    const result = decrypt(plainText);
    expect(result).toBe(plainText);
  });

  it("should throw an error on malformed encrypted text structure", () => {
    expect(() => decrypt("enc:v1:invalid")).toThrow(/Invalid encrypted text format/);
  });
});