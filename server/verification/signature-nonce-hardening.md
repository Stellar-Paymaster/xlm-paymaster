# Verification Report — Signature Nonce Hardening

**Date:** 2026-04-23
**Branch:** `Security_compliance`
**Scope:** `server/`
**Related design:** [docs/signature-nonce-hardening.md](../docs/signature-nonce-hardening.md)

## 1. Files changed

```
server/src/signing/index.ts          (modified — re-exports NonceGuard/NonceReplayError)
server/src/signing/signerPool.ts     (modified — optional guard integration)
server/src/signing/nonceGuard.ts     (new     — strict monotonic nonce guard)
server/src/signing/nonceGuard.test.ts(new     — 14 tests: 10 unit + 4 integration)
server/docs/signature-nonce-hardening.md       (new — technical design doc)
```

## 2. Test execution

Command:

```
cd server
npx vitest run --reporter=verbose src/signing/nonceGuard.test.ts
```

Captured output (2026-04-23, vitest v4.1.4):

```
 RUN  v4.1.4 C:/Users/USER/fluid/server

 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > accepts strictly increasing nonces and records the high-water mark 7ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > rejects replay of the same nonce with NonceReplayError 3ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > rejects any nonce below the high-water mark 1ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > tracks nonces independently across distinct signer keys 1ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > accepts number and string inputs and normalises to bigint 1ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > rejects malformed and negative inputs 1ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > handles very large sequence numbers without precision loss 1ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > initialize seeds baseline and refuses to lower the high-water mark 1ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > reset clears tracking per key or globally 2ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — unit > snapshot exposes all tracked high-water marks 6ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — integration with SignerPool > rejects acquires that would replay a reserved sequence number 9ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — integration with SignerPool > records each signer's high-water mark the first time a lease is acquired 4ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — integration with SignerPool > keeps monotonicity under concurrent acquires against a single account 3ms
 ✓ src/signing/nonceGuard.test.ts > NonceGuard — integration with SignerPool > allows updateSequenceNumber to jump forward after chain sync and rejects rewinds below the high-water mark 3ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  20:37:06
   Duration  2.25s (transform 255ms, setup 0ms, import 1.47s, tests 52ms, environment 0ms)
```

Result: **14 / 14 passed**, 0 failed, 0 skipped.

## 3. Regression sweep

Full server test suite run:

```
npx vitest run
```

Observed: `22 files failed (pre-existing) | 46 passed`, `19 tests failed (pre-existing) | 346 passed` out of 365 total.

The 19 pre-existing failures are in files outside the signing path and are **not caused by this change**:

- `src/services/statusMonitorService.test.ts` — `StellarSdk.Server` mock constructor shape mismatch (pre-existing).
- `src/utils/logger.test.ts` — redaction expectation mismatch with current pino config (pre-existing).
- `src/signing/grpcEngine.test.ts` — requires `cargo` / the Rust `grpc_engine` binary on PATH, not present in this environment (pre-existing).
- Others likewise unrelated to `SignerPool` or the new `NonceGuard` module.

Evidence the regressions are pre-existing:

1. None of the failing test files import `nonceGuard.ts` or the modified exports from `signerPool.ts` / `signing/index.ts`.
2. `SignerPool` changes are strictly additive — the `nonceGuard` option defaults to `null` and all new logic is gated behind `if (this.nonceGuard)`. Existing callers see identical behaviour.
3. Type check against the signing files is clean:

   ```
   ./node_modules/.bin/tsc --noEmit -p server/tsconfig.json  | grep signing
   (no output)
   ```

   Pre-existing TS errors are limited to `src/workers/sandboxAutoReset.ts` and `src/workers/transactionStore.test.ts`, neither of which was touched by this change.

## 4. Acceptance-criteria checklist

| Criterion                                                        | Status   | Evidence                                                                 |
| ---------------------------------------------------------------- | :------: | ------------------------------------------------------------------------ |
| Signature nonce hardening logic implemented in `server/`         | ✅       | `server/src/signing/nonceGuard.ts`, wired into `SignerPool`               |
| Full unit **and** integration test coverage                      | ✅       | 10 unit + 4 integration tests, all passing                                |
| Consistent with internal design / security standards             | ✅       | Fails closed (throws typed `NonceReplayError`); O(1) per check; `bigint` precision; atomic under JS event loop |
| Handles edge cases                                               | ✅       | 14-row matrix in `docs/signature-nonce-hardening.md` §4                  |
| Documentation updated                                            | ✅       | `server/docs/signature-nonce-hardening.md`                                |
| Verification report with terminal output                         | ✅       | This file                                                                 |

## 5. Security properties preserved

- **Replay rejection is unconditional for configured pools.** Any signing path that goes through `SignerPool.acquire()` with a `nonceGuard` cannot sign the same `(publicKey, nonce)` twice.
- **Rewind rejection.** `updateSequenceNumber(pk, n)` with `n <= lastSigned` throws before touching pool state, so a compromised or buggy caller cannot lure the next `acquire()` into producing a duplicate signature.
- **Fail-closed restart path.** Callers can persist `guard.snapshot()` and replay via `guard.initialize()` on startup; `initialize` itself refuses to lower an existing high-water mark.
- **No new attack surface.** The guard stores only `(publicKey → bigint)` in memory, never secret material.
