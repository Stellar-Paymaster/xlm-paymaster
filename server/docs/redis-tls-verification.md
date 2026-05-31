# Redis TLS enforcement — environment validation checklist & verification report

This document covers the production TLS policy enforced by the Redis client
factory (`server/src/utils/redisClientFactory.ts`) and captures verified local
test output produced with self-signed TLS certificates.

## What changed

All Redis connections are now built through a single factory that enforces an
encrypted, certificate-authority-verified transport in production:

- `server/src/utils/redisClientFactory.ts` — new `buildRedisOptions()` /
  `createRedisClient()` that apply and validate the TLS policy.
- `server/src/utils/redis.ts`, `server/src/services/auditLog.ts`,
  `server/src/services/webhook.ts` — now obtain their client from the factory
  instead of constructing `new Redis(process.env.REDIS_URL ...)` directly.

### Production invariants (fail fast at startup)

1. **TLS-only protocol.** When `NODE_ENV=production`, `REDIS_URL` **must** use
   the `rediss://` scheme. A plaintext `redis://` URL throws on startup so API
   metrics are never sent in the clear.
2. **Certificate authority required.** `REDIS_TLS_CA_PATH` must point to the PEM
   used to verify the Redis server. The server certificate is always verified
   (`rejectUnauthorized: true`); the `REDIS_TLS_REJECT_UNAUTHORIZED=false`
   escape hatch is **ignored** in production.

In non-production profiles the factory stays permissive (plaintext allowed,
self-signed CAs supported) so the encrypted path can be exercised locally.

## Environment validation checklist

| Variable | Required | Purpose |
| --- | --- | --- |
| `REDIS_URL` | yes | Connection string. **Must be `rediss://` in production.** Defaults to `redis://127.0.0.1:6379` locally. |
| `REDIS_TLS_CA_PATH` | yes in production | PEM file of the CA that signs the Redis server certificate. |
| `REDIS_TLS_CERT_PATH` | optional | Client certificate PEM for mutual TLS. Set **with** `REDIS_TLS_KEY_PATH` or neither. |
| `REDIS_TLS_KEY_PATH` | optional | Client private key PEM for mutual TLS. |
| `REDIS_TLS_SERVERNAME` | optional | SNI / cert hostname override (e.g. connect to `127.0.0.1` with a cert issued for `localhost`). |
| `REDIS_TLS_REJECT_UNAUTHORIZED` | optional | Local-only opt-out (`false`) to skip CA verification of an untrusted self-signed cert. **Ignored in production.** |

Pre-deploy verification steps:

- [ ] `REDIS_URL` begins with `rediss://` in every production profile.
- [ ] `REDIS_TLS_CA_PATH` is set and the file is readable by the service user.
- [ ] If mutual TLS is used, **both** `REDIS_TLS_CERT_PATH` and
      `REDIS_TLS_KEY_PATH` are set.
- [ ] `REDIS_TLS_REJECT_UNAUTHORIZED` is left unset / `true` in production.
- [ ] Service boots without throwing a `[Redis]` configuration error.

## Local testing with self-signed certificates

Two verifications are provided: a unit suite and an end-to-end TLS connection
demo. Both generate self-signed certificates on the fly (via `node-forge`).

### 1. Unit suite (verified output)

Command (run from `server/`):

```bash
npx vitest run src/utils/redisClientFactory.test.ts
```

Output:

```text
 RUN  v4.1.4 C:/Users/USER/fluid/server

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  13:35:36
   Duration  4.38s (transform 104ms, setup 0ms, import 3.21s, tests 884ms, environment 0ms)
```

### 2. End-to-end self-signed TLS connection demo (verified output)

This stands up a minimal RESP-speaking TLS server using a freshly generated
self-signed CA + server certificate, then drives a real `ioredis` client built
by the factory through an encrypted, CA-verified `rediss://` connection.

Command (run from `server/`):

```bash
npx ts-node scripts/redisTlsDemo.ts
```

Output:

```text
Self-signed TLS Redis stand-in listening on rediss://127.0.0.1:60118

  ✓ production redis:// rejected — [Redis] Production requires a TLS connection
  ✓ production rediss:// without CA rejected — [Redis] Production TLS requires a certificate authority
  ✓ TLS handshake authorized against self-signed CA (cipher TLS_AES_256_GCM_SHA384)
  ✓ encrypted SET/GET round-trip succeeded (value="encrypted-in-transit")
  ✓ wrong CA rejected by verification — unable to verify the first certificate

All TLS enforcement checks passed.
```

This confirms all three acceptance criteria:

1. **Restrict connection protocols to TLS in production** — plaintext
   `redis://` is rejected.
2. **Require certificate authority checks for client instances** — connections
   without a CA are rejected, and a wrong CA fails verification.
3. **Test connections locally using self-signed TLS certificates** — a real
   encrypted SET/GET round-trip completes against the self-signed server.
