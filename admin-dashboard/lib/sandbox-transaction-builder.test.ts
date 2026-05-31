import { describe, it, expect } from "vitest";
import {
  validateTransactionFields,
  buildTransactionXdr,
  DEFAULT_FIELDS,
  type SandboxTransactionFields,
} from "./sandbox-transaction-builder";

// Valid 56-char Stellar public keys (G + 55 base32 chars)
const VALID_SRC = "GBVVJJWAKGKF3YJKBZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZ";
const VALID_DST = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQY2KFOBBM2AFBGZXPWZA";

function valid(overrides: Partial<SandboxTransactionFields> = {}): SandboxTransactionFields {
  return {
    ...DEFAULT_FIELDS,
    sourceAccount: VALID_SRC,
    destinationAccount: VALID_DST,
    ...overrides,
  };
}

describe("validateTransactionFields", () => {
  it("accepts a fully valid payment", () => {
    const result = validateTransactionFields(valid());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("rejects an invalid source account", () => {
    const result = validateTransactionFields(valid({ sourceAccount: "bad" }));
    expect(result.valid).toBe(false);
    expect(result.errors.sourceAccount).toBeDefined();
  });

  it("rejects an invalid destination account for payment", () => {
    const result = validateTransactionFields(valid({ destinationAccount: "bad" }));
    expect(result.valid).toBe(false);
    expect(result.errors.destinationAccount).toBeDefined();
  });

  it("skips destination validation for manage_data", () => {
    const result = validateTransactionFields(
      valid({ operationType: "manage_data", destinationAccount: "" })
    );
    expect(result.errors.destinationAccount).toBeUndefined();
  });

  it("rejects zero amount", () => {
    const result = validateTransactionFields(valid({ amount: "0" }));
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  it("rejects negative amount", () => {
    const result = validateTransactionFields(valid({ amount: "-5" }));
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  it("rejects fee below 100", () => {
    const result = validateTransactionFields(valid({ fee: "50" }));
    expect(result.valid).toBe(false);
    expect(result.errors.fee).toBeDefined();
  });

  it("accepts fee exactly 100", () => {
    const result = validateTransactionFields(valid({ fee: "100" }));
    expect(result.errors.fee).toBeUndefined();
  });

  it("rejects empty network passphrase", () => {
    const result = validateTransactionFields(valid({ networkPassphrase: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.networkPassphrase).toBeDefined();
  });

  it("accumulates multiple errors", () => {
    const result = validateTransactionFields(
      valid({ sourceAccount: "bad", amount: "0", fee: "10" })
    );
    expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildTransactionXdr", () => {
  it("returns an XDR string and summary for a valid payment", () => {
    const { xdr, summary } = buildTransactionXdr(valid());
    expect(xdr).toMatch(/^SANDBOX_XDR_/);
    expect(summary).toContain("PAYMENT");
    expect(summary).toContain("XLM");
  });

  it("summary includes operation type for manage_data", () => {
    const { summary } = buildTransactionXdr(
      valid({ operationType: "manage_data", destinationAccount: "" })
    );
    expect(summary).toContain("MANAGE_DATA");
  });

  it("throws when fields are invalid", () => {
    expect(() =>
      buildTransactionXdr(valid({ sourceAccount: "bad" }))
    ).toThrow("Invalid fields");
  });

  it("produces different XDRs for different amounts", () => {
    const a = buildTransactionXdr(valid({ amount: "10" }));
    const b = buildTransactionXdr(valid({ amount: "20" }));
    expect(a.xdr).not.toBe(b.xdr);
  });

  it("produces different XDRs for different networks", () => {
    const a = buildTransactionXdr(valid({ networkPassphrase: "Test SDF Network ; September 2015" }));
    const b = buildTransactionXdr(valid({ networkPassphrase: "Public Global Stellar Network ; September 2015" }));
    expect(a.xdr).not.toBe(b.xdr);
  });
});
