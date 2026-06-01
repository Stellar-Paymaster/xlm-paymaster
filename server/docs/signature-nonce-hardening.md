# Signature Nonce Hardening

**Status:** Implemented — `server/src/signing/nonceGuard.ts`
**Scope:** `server/` (TypeScript signer runtime)
**Risk area mitigated:** Signature replay via nonce reuse

## 1. Problem

Before this change, the Fluid TypeScript signer tracked sequence numbers (Stellar's per-account nonce) entirely through the in-memory counter inside `SignerPool`. Two properties held only by convention:

- Every `SignerPool.acquire()` reserves the current counter and increments it by one.
- `SignerPool.updateSequenceNumber()` overwrites the counter with any value the caller supplies.

Nothing in the signer itself enforced that a given `(publicKey, nonce)` pair is consumed **at most once**. A caller with access to `updateSequenceNumber` (legitimate resync, buggy orchestration, or a compromised surface) could rewind the counter and make the signer re-sign a nonce it had already consumed. That is the textbook replay vector for a signing oracle.

## 2. Goal

Add a dedicated, independent component that:

1. Maintains a strict **monotonically increasing** high-water mark per signer public key.
2. Rejects **any** signing attempt whose nonce is not strictly greater than the recorded mark, regardless of code path.
3. Does not alter the happy path performance characteristics of `SignerPool` (single `Map.get` + comparison + `Map.set` per acquire, synchronous).
4. Is testable without depending on the native `fluid_signer` binding or external services.

## 3. Design

### 3.1 `NonceGuard`

`server/src/signing/nonceGuard.ts` exports `NonceGuard` plus `NonceReplayError`.

```ts
class NonceGuard {
  assertAndRecord(publicKey: string, nonce: bigint | number | string): bigint;
  peek(publicKey: string): bigint | null;
  initialize(publicKey: string, nonce: bigint | number | string): bigint;
  reset(publicKey?: string): void;
  snapshot(): NonceGuardSnapshotEntry[];
}
```

Semantics:

| Method              | Effect                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assertAndRecord`   | Throws `NonceReplayError` if `nonce <= peek(publicKey)`; otherwise records `nonce` as the new high-water mark. Atomic under the JS event loop (no `await`).     |
| `peek`              | Returns the last recorded nonce for the key, or `null` if never observed.                                                                                       |
| `initialize`        | Seeds the high-water mark on boot from a persisted value (fail-closed across restarts). Refuses to *lower* an existing mark.                                    |
| `reset`             | Clears tracking for one key (rotation) or globally (tests).                                                                                                     |
| `snapshot`          | Serialisable view of all tracked keys → observability/audit.                                                                                                    |

`bigint` is the internal representation because Stellar sequence numbers are 64-bit and `Number` loses precision past 2^53.

### 3.2 Integration with `SignerPool`

`SignerPool` takes an optional `nonceGuard` in its options. When present:

- **Every `acquire()` calls `nonceGuard.assertAndRecord(publicKey, reservedSequenceNumber)` *before* mutating any pool state.** If the guard throws, the in-flight counter, total-uses counter, and sequence number stay consistent — the acquire is a no-op from the pool's perspective.
- **`updateSequenceNumber(publicKey, n)` checks the guard's `peek`. If `n <= lastSigned`, it throws `NonceReplayError`.** The check is read-only; the guard advances only when an actual lease consumes a nonce. This prevents operator-error or adversarial rewinds from letting the next acquire replay.
- Forward jumps (e.g., re-syncing the counter with Horizon after a deploy) remain free.

Existing callers that do not pass `nonceGuard` see **zero behavioural change**.

### 3.3 Restart safety (optional, caller-driven)

For production the recommended pattern is:

```ts
const guard = new NonceGuard();
for (const { publicKey, lastSignedNonce } of await loadPersistedHighWaterMarks()) {
  guard.initialize(publicKey, lastSignedNonce);
}
const pool = new SignerPool(accounts, { nonceGuard: guard });
```

Persist `guard.snapshot()` on shutdown (or periodically) so the guard survives restarts. Without persistence, the guard still protects within the lifetime of the process, which is the common replay window.

## 4. Edge cases covered by tests

| # | Case                                                              | Test                                                                            |
| - | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1 | Strictly increasing nonces accepted                               | `accepts strictly increasing nonces and records the high-water mark`            |
| 2 | Same-nonce replay                                                 | `rejects replay of the same nonce with NonceReplayError`                        |
| 3 | Stale nonce below high-water mark                                 | `rejects any nonce below the high-water mark`                                   |
| 4 | Independent tracking across signer keys                           | `tracks nonces independently across distinct signer keys`                       |
| 5 | Input normalisation (`bigint` / `number` / `string`)              | `accepts number and string inputs and normalises to bigint`                     |
| 6 | Malformed and negative inputs                                     | `rejects malformed and negative inputs`                                         |
| 7 | 64-bit nonces near `i64::MAX`                                     | `handles very large sequence numbers without precision loss`                    |
| 8 | `initialize` seeding + refusing to lower                          | `initialize seeds baseline and refuses to lower the high-water mark`            |
| 9 | `reset` per-key and global                                        | `reset clears tracking per key or globally`                                     |
| 10 | Snapshot for observability                                       | `snapshot exposes all tracked high-water marks`                                 |
| 11 | Pool rejects sequence rewind via `updateSequenceNumber`          | `rejects acquires that would replay a reserved sequence number`                 |
| 12 | Guard records the first acquire per key                          | `records each signer's high-water mark the first time a lease is acquired`     |
| 13 | Concurrent acquires produce no duplicates or gaps                | `keeps monotonicity under concurrent acquires against a single account`         |
| 14 | Forward jumps allowed, rewinds rejected                          | `allows updateSequenceNumber to jump forward after chain sync and rejects rewinds` |

## 5. Non-goals

- **Cross-process / clustered guard.** The current guard is in-memory. If Fluid runs multiple signer nodes behind a load balancer, the guard must be backed by a shared store (Redis `SETNX`, Postgres `UPDATE ... WHERE seq > current`). The `NonceGuard` API is shaped so that a backing-store implementation is a drop-in substitution.
- **Signing of external payloads.** The guard protects Stellar account-sequence-based transactions produced through `SignerPool`. It does not apply to one-off `signTransaction(tx, secret, passphrase)` calls that bypass the pool; those flows do not carry a per-key nonce in the first place.

## 6. Verification

Run:

```bash
cd server
npx vitest run src/signing/nonceGuard.test.ts
```

Expected: `14 passed (14)`. See [../verification/signature-nonce-hardening.md](../verification/signature-nonce-hardening.md) for captured terminal output.
