import { describe, it, expect, beforeEach } from "vitest";
import {
  prepareOfflineTransaction,
  getPendingOfflineTransactions,
  removePreparedTransaction,
  clearPreparedTransactions,
  getPendingCount,
  OFFLINE_TX_STORAGE_KEY,
} from "../../offline-tx";

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    store,
  };
}

const TESTNET = "Test SDF Network ; September 2015";
const FAKE_XDR = "AAAAAQAAAABZ2a3Hfake==";

describe("prepareOfflineTransaction", () => {
  it("persists a record to storage and returns it", () => {
    const storage = makeStorage();
    const now = 1_700_000_000_000;

    const record = prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { now });

    expect(record.signedXdr).toBe(FAKE_XDR);
    expect(record.networkPassphrase).toBe(TESTNET);
    expect(record.preparedAt).toBe(now);
    expect(record.submit).toBe(false);
    expect(typeof record.id).toBe("string");
    expect(record.id.startsWith("fluid_offline_")).toBe(true);
    expect(storage.store.has(OFFLINE_TX_STORAGE_KEY)).toBe(true);
  });

  it("sets submit flag from options", () => {
    const storage = makeStorage();
    const record = prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { submit: true });
    expect(record.submit).toBe(true);
  });

  it("stores optional metadata", () => {
    const storage = makeStorage();
    const meta = { note: "payment to alice", ref: "PAY-001" };
    const record = prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { metadata: meta });
    expect(record.metadata).toEqual(meta);
  });

  it("accumulates multiple records without overwriting", () => {
    const storage = makeStorage();
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { now: 1 });
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { now: 2 });
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { now: 3 });

    const pending = getPendingOfflineTransactions(storage);
    expect(pending).toHaveLength(3);
    const timestamps = pending.map((r) => r.preparedAt);
    expect(timestamps).toContain(1);
    expect(timestamps).toContain(2);
    expect(timestamps).toContain(3);
  });
});

describe("getPendingOfflineTransactions", () => {
  it("returns empty array when storage is empty", () => {
    const storage = makeStorage();
    expect(getPendingOfflineTransactions(storage)).toEqual([]);
  });

  it("returns empty array when storage contains invalid JSON", () => {
    const storage = makeStorage();
    storage.setItem(OFFLINE_TX_STORAGE_KEY, "not-json");
    expect(getPendingOfflineTransactions(storage)).toEqual([]);
  });

  it("returns empty array when storage contains non-array JSON", () => {
    const storage = makeStorage();
    storage.setItem(OFFLINE_TX_STORAGE_KEY, JSON.stringify({ oops: true }));
    expect(getPendingOfflineTransactions(storage)).toEqual([]);
  });
});

describe("getPendingCount", () => {
  it("returns 0 for empty storage", () => {
    expect(getPendingCount(makeStorage())).toBe(0);
  });

  it("reflects the number of stored transactions", () => {
    const storage = makeStorage();
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage);
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage);
    expect(getPendingCount(storage)).toBe(2);
  });
});

describe("removePreparedTransaction", () => {
  it("removes only the record with the given id", () => {
    const storage = makeStorage();
    const a = prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { now: 1 });
    const b = prepareOfflineTransaction(FAKE_XDR, TESTNET, storage, { now: 2 });

    removePreparedTransaction(a.id, storage);

    const pending = getPendingOfflineTransactions(storage);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(b.id);
  });

  it("is a no-op for an id that does not exist", () => {
    const storage = makeStorage();
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage);
    removePreparedTransaction("no-such-id", storage);
    expect(getPendingCount(storage)).toBe(1);
  });
});

describe("clearPreparedTransactions", () => {
  it("empties all stored transactions", () => {
    const storage = makeStorage();
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage);
    prepareOfflineTransaction(FAKE_XDR, TESTNET, storage);

    clearPreparedTransactions(storage);

    expect(getPendingCount(storage)).toBe(0);
  });
});
