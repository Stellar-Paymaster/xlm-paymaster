import { describe, it, expect } from "vitest";
import { extractAddresses } from "./stellarAddressExtractor";
import type { Transaction } from "@stellar/stellar-sdk";

function makeTx(
  source: string,
  operations: Array<Record<string, unknown>>
): Transaction {
  return {
    source,
    operations,
  } as unknown as Transaction;
}

describe("extractAddresses", () => {
  it("includes the transaction source account", () => {
    const tx = makeTx("GABC", []);
    expect(extractAddresses(tx)).toContain("GABC");
  });

  it("includes destinations on payment operations", () => {
    const tx = makeTx("GABC", [
      { type: "payment", destination: "GDEST" },
    ]);
    const addrs = extractAddresses(tx);
    expect(addrs).toContain("GABC");
    expect(addrs).toContain("GDEST");
  });

  it("includes destinations on createAccount operations", () => {
    const tx = makeTx("GABC", [
      { type: "createAccount", destination: "GNEW" },
    ]);
    expect(extractAddresses(tx)).toContain("GNEW");
  });

  it("includes destinations on pathPaymentStrictReceive", () => {
    const tx = makeTx("GABC", [
      { type: "pathPaymentStrictReceive", destination: "GPATH" },
    ]);
    expect(extractAddresses(tx)).toContain("GPATH");
  });

  it("includes destinations on pathPaymentStrictSend", () => {
    const tx = makeTx("GABC", [
      { type: "pathPaymentStrictSend", destination: "GPATHS" },
    ]);
    expect(extractAddresses(tx)).toContain("GPATHS");
  });

  it("includes destinations on accountMerge", () => {
    const tx = makeTx("GABC", [
      { type: "accountMerge", destination: "GMERGE" },
    ]);
    expect(extractAddresses(tx)).toContain("GMERGE");
  });

  it("does not include destination on non-destination operations", () => {
    const tx = makeTx("GABC", [
      { type: "manageOffer", destination: "GSHOULD_NOT_APPEAR" },
    ]);
    expect(extractAddresses(tx)).not.toContain("GSHOULD_NOT_APPEAR");
  });

  it("includes per-operation source overrides", () => {
    const tx = makeTx("GABC", [
      { type: "payment", source: "GOPSRC", destination: "GDEST" },
    ]);
    const addrs = extractAddresses(tx);
    expect(addrs).toContain("GOPSRC");
    expect(addrs).toContain("GDEST");
  });

  it("deduplicates repeated addresses", () => {
    const tx = makeTx("GABC", [
      { type: "payment", source: "GABC", destination: "GDEST" },
      { type: "payment", destination: "GDEST" },
    ]);
    const addrs = extractAddresses(tx);
    expect(addrs.filter(a => a === "GABC").length).toBe(1);
    expect(addrs.filter(a => a === "GDEST").length).toBe(1);
  });

  it("ignores null/undefined fields", () => {
    const tx = makeTx("GABC", [
      { type: "payment", source: null, destination: undefined },
    ]);
    expect(() => extractAddresses(tx)).not.toThrow();
    const addrs = extractAddresses(tx);
    expect(addrs).toEqual(["GABC"]);
  });

  it("returns empty array for transaction with no source and no ops", () => {
    const tx = makeTx("", []);
    expect(extractAddresses(tx)).toEqual([]);
  });
});
