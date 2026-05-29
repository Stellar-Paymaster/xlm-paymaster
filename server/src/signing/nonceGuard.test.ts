import { describe, expect, it } from "vitest";
import StellarSdk from "@stellar/stellar-sdk";

import { NonceGuard, NonceReplayError } from "./nonceGuard";
import { SignerPool } from "./signerPool";

describe("NonceGuard — unit", () => {
  it("accepts strictly increasing nonces and records the high-water mark", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "A".repeat(54);

    expect(guard.peek(publicKey)).toBe(null);

    guard.assertAndRecord(publicKey, 1n);
    guard.assertAndRecord(publicKey, 2n);
    guard.assertAndRecord(publicKey, 100n);

    expect(guard.peek(publicKey)).toBe(100n);
  });

  it("rejects replay of the same nonce with NonceReplayError", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "B".repeat(54);

    guard.assertAndRecord(publicKey, 42n);

    expect(() => guard.assertAndRecord(publicKey, 42n)).toThrow(NonceReplayError);
    try {
      guard.assertAndRecord(publicKey, 42n);
    } catch (error) {
      const replay = error as NonceReplayError;
      expect(replay.name).toBe("NonceReplayError");
      expect(replay.publicKey).toBe(publicKey);
      expect(replay.attemptedNonce).toBe(42n);
      expect(replay.lastNonce).toBe(42n);
    }

    expect(guard.peek(publicKey)).toBe(42n);
  });

  it("rejects any nonce below the high-water mark", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "C".repeat(54);

    guard.assertAndRecord(publicKey, 50n);

    expect(() => guard.assertAndRecord(publicKey, 49n)).toThrow(NonceReplayError);
    expect(() => guard.assertAndRecord(publicKey, 0n)).toThrow(NonceReplayError);
    expect(guard.peek(publicKey)).toBe(50n);
  });

  it("tracks nonces independently across distinct signer keys", () => {
    const guard = new NonceGuard();
    const keyA = "GA" + "D".repeat(54);
    const keyB = "GA" + "E".repeat(54);

    guard.assertAndRecord(keyA, 10n);
    guard.assertAndRecord(keyB, 1n);
    guard.assertAndRecord(keyA, 11n);
    guard.assertAndRecord(keyB, 2n);

    expect(guard.peek(keyA)).toBe(10n + 1n);
    expect(guard.peek(keyB)).toBe(2n);
  });

  it("accepts number and string inputs and normalises to bigint", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "F".repeat(54);

    expect(guard.assertAndRecord(publicKey, 1)).toBe(1n);
    expect(guard.assertAndRecord(publicKey, "2")).toBe(2n);
    expect(guard.assertAndRecord(publicKey, 3n)).toBe(3n);
    expect(guard.peek(publicKey)).toBe(3n);
  });

  it("rejects malformed and negative inputs", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "G".repeat(54);

    expect(() => guard.assertAndRecord(publicKey, -1n)).toThrow(RangeError);
    expect(() => guard.assertAndRecord(publicKey, 1.5)).toThrow(TypeError);
    expect(() => guard.assertAndRecord(publicKey, "")).toThrow(TypeError);
    expect(() => guard.assertAndRecord("", 1n)).toThrow(TypeError);
  });

  it("handles very large sequence numbers without precision loss", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "H".repeat(54);
    const large = 9_223_372_036_854_775_806n; // near int64 max, Stellar's domain
    const larger = large + 1n;

    guard.assertAndRecord(publicKey, large);
    guard.assertAndRecord(publicKey, larger);

    expect(guard.peek(publicKey)).toBe(larger);
    expect(() => guard.assertAndRecord(publicKey, large)).toThrow(NonceReplayError);
  });

  it("initialize seeds baseline and refuses to lower the high-water mark", () => {
    const guard = new NonceGuard();
    const publicKey = "GA" + "I".repeat(54);

    guard.initialize(publicKey, 1000n);
    expect(guard.peek(publicKey)).toBe(1000n);

    expect(() => guard.assertAndRecord(publicKey, 1000n)).toThrow(NonceReplayError);
    guard.assertAndRecord(publicKey, 1001n);

    expect(() => guard.initialize(publicKey, 500n)).toThrow(NonceReplayError);
    expect(guard.peek(publicKey)).toBe(1001n);
  });

  it("reset clears tracking per key or globally", () => {
    const guard = new NonceGuard();
    const keyA = "GA" + "J".repeat(54);
    const keyB = "GA" + "K".repeat(54);

    guard.assertAndRecord(keyA, 5n);
    guard.assertAndRecord(keyB, 7n);

    guard.reset(keyA);
    expect(guard.peek(keyA)).toBe(null);
    expect(guard.peek(keyB)).toBe(7n);

    guard.reset();
    expect(guard.peek(keyB)).toBe(null);
  });

  it("snapshot exposes all tracked high-water marks", () => {
    const guard = new NonceGuard();
    const keyA = "GA" + "L".repeat(54);
    const keyB = "GA" + "M".repeat(54);

    guard.assertAndRecord(keyA, 3n);
    guard.assertAndRecord(keyB, 99n);

    const snapshot = guard.snapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot).toEqual(
      expect.arrayContaining([
        { publicKey: keyA, lastNonce: "3" },
        { publicKey: keyB, lastNonce: "99" },
      ]),
    );
  });
});

describe("NonceGuard — integration with SignerPool", () => {
  it("rejects acquires that would replay a reserved sequence number", async () => {
    const keypair = StellarSdk.Keypair.random();
    const guard = new NonceGuard();
    const pool = new SignerPool(
      [{ initialSequenceNumber: 10n, keypair, secret: keypair.secret() }],
      { nonceGuard: guard },
    );

    const first = await pool.acquire();
    expect(first.reservedSequenceNumber).toBe(10n);
    await first.release();

    // Simulate a buggy/malicious rewind of the pool's internal counter to a
    // nonce we've already signed. updateSequenceNumber must refuse it.
    await expect(pool.updateSequenceNumber(keypair.publicKey(), 10n)).rejects.toBeInstanceOf(
      NonceReplayError,
    );

    // The in-memory sequence counter is untouched, so the next acquire still
    // advances monotonically from where we left off.
    const second = await pool.acquire();
    expect(second.reservedSequenceNumber).toBe(11n);
    await second.release();

    expect(guard.peek(keypair.publicKey())).toBe(11n);
  });

  it("records each signer's high-water mark the first time a lease is acquired", async () => {
    const keypairs = [
      StellarSdk.Keypair.random(),
      StellarSdk.Keypair.random(),
      StellarSdk.Keypair.random(),
    ];
    const guard = new NonceGuard();
    const pool = new SignerPool(
      keypairs.map((keypair, index) => ({
        initialSequenceNumber: BigInt(index * 100 + 1),
        keypair,
        secret: keypair.secret(),
      })),
      { nonceGuard: guard, selectionStrategy: "round_robin" },
    );

    for (const keypair of keypairs) {
      expect(guard.peek(keypair.publicKey())).toBe(null);
    }

    const reservedByKey = new Map<string, bigint>();
    for (let i = 0; i < keypairs.length; i += 1) {
      const lease = await pool.acquire();
      reservedByKey.set(lease.account.publicKey, lease.reservedSequenceNumber!);
      await lease.release();
    }

    expect(reservedByKey.get(keypairs[0].publicKey())).toBe(1n);
    expect(reservedByKey.get(keypairs[1].publicKey())).toBe(101n);
    expect(reservedByKey.get(keypairs[2].publicKey())).toBe(201n);
    expect(guard.peek(keypairs[0].publicKey())).toBe(1n);
    expect(guard.peek(keypairs[1].publicKey())).toBe(101n);
    expect(guard.peek(keypairs[2].publicKey())).toBe(201n);
  });

  it("keeps monotonicity under concurrent acquires against a single account", async () => {
    const keypair = StellarSdk.Keypair.random();
    const guard = new NonceGuard();
    const pool = new SignerPool(
      [{ initialSequenceNumber: 1n, keypair, secret: keypair.secret() }],
      { nonceGuard: guard },
    );

    const leases = await Promise.all(
      Array.from({ length: 25 }, () => pool.acquire()),
    );

    const reserved = leases.map((lease) => lease.reservedSequenceNumber!);
    // Sort a copy and verify it matches strictly increasing 1..25 — i.e., no
    // duplicates and no gaps were produced under concurrent acquire pressure.
    const sorted = [...reserved].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    expect(sorted).toEqual(Array.from({ length: 25 }, (_, index) => BigInt(index + 1)));

    for (const lease of leases) {
      await lease.release();
    }

    expect(guard.peek(keypair.publicKey())).toBe(25n);
  });

  it("allows updateSequenceNumber to jump forward after chain sync and rejects rewinds below the high-water mark", async () => {
    const keypair = StellarSdk.Keypair.random();
    const guard = new NonceGuard();
    const pool = new SignerPool(
      [{ initialSequenceNumber: 5n, keypair, secret: keypair.secret() }],
      { nonceGuard: guard },
    );

    // Operator pulls a fresh sequence number from Horizon. The guard hasn't
    // observed this key yet, so the jump is allowed and does not record.
    await pool.updateSequenceNumber(keypair.publicKey(), 1000n);
    expect(guard.peek(keypair.publicKey())).toBe(null);

    const lease = await pool.acquire();
    expect(lease.reservedSequenceNumber).toBe(1000n);
    await lease.release();
    expect(guard.peek(keypair.publicKey())).toBe(1000n);

    // Attempting to rewind to 999 — a value we already signed past — is a
    // replay vector and must be rejected before it reaches the pool state.
    await expect(pool.updateSequenceNumber(keypair.publicKey(), 999n)).rejects.toBeInstanceOf(
      NonceReplayError,
    );
    // Rewinding to exactly the last signed nonce is also rejected.
    await expect(pool.updateSequenceNumber(keypair.publicKey(), 1000n)).rejects.toBeInstanceOf(
      NonceReplayError,
    );
    // Jumping forward past the last signed nonce remains permitted.
    await pool.updateSequenceNumber(keypair.publicKey(), 5000n);
    const nextLease = await pool.acquire();
    expect(nextLease.reservedSequenceNumber).toBe(5000n);
    await nextLease.release();
  });
});
