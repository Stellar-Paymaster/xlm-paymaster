# Connection Pool Fine-Tuning (PgBouncer-Style)

**Status:** Implemented — `server/src/db/connectionPool.ts`, `server/src/db/pooledDatabase.ts`
**Scope:** `server/` (TypeScript database layer)
**Goal:** Bound DB concurrency for bursty fee-bump traffic with the same tuning knobs PgBouncer exposes.

## 1. Problem

Fee-bump requests each touch the database — quota counters, transaction ledger, milestone updates, audit log. Under burst load we were leaning on whatever the runtime did with the shared `prisma` singleton: no explicit ceiling on concurrent DB work, no FIFO ordering across acquires, no timeouts for queued requests, no recycling of stale resources, no visibility into saturation.

That matches the exact problem PgBouncer solves at the Postgres layer — pool *many* client requests onto a *bounded* set of backend connections, with queueing, timeouts, idle eviction, and max-lifetime recycling.

## 2. Non-goals

- **Running a separate PgBouncer process.** Fluid's server uses Prisma over the `better-sqlite3` adapter (single-writer storage). A literal Postgres proxy is not applicable. We implement the *pattern* in-process.
- **Replacing Prisma.** The pool is layered *on top of* the existing `prisma` singleton. No model changes.

## 3. Design

Two modules:

### 3.1 `ConnectionPool<T>` — generic, transport-agnostic

`server/src/db/connectionPool.ts` — a `ConnectionPool<T>` class that bounds concurrency over any reusable resource. Tuning knobs map directly to PgBouncer settings:

| Option             | PgBouncer analogue           | Purpose                                                       |
| ------------------ | ---------------------------- | ------------------------------------------------------------- |
| `maxSize`          | `max_client_conn`            | Hard ceiling on live resources                                |
| `minSize`          | `default_pool_size` (floor)  | Keep this many warm to avoid cold-start latency               |
| `acquireTimeoutMs` | `query_wait_timeout`         | FIFO queue deadline — overflow acquires reject, never block   |
| `idleTimeoutMs`    | `server_idle_timeout`        | Destroy idle resources past this age                          |
| `maxLifetimeMs`    | `server_lifetime`            | Mandatory recycle after N ms                                  |
| `validate(res)`    | server-probe health checks   | Evict unhealthy resources on acquire                          |
| `factory`          | N/A — host-level concern     | Open a new backend resource                                   |
| `destroy`          | N/A — host-level concern     | Close an existing backend resource                            |

Key invariants:

- `inUse + idle + creating ≤ maxSize` — hard cap is honoured even under contention.
- Acquire ordering is FIFO; overflow requests wait until a resource is released or the acquire deadline elapses.
- Released resources are handed directly to the next waiter before any new resource is created, keeping create/destroy churn minimal.
- `drain()` stops accepting new acquires, rejects queued ones with `ConnectionPoolDrainedError`, waits for in-flight leases to finish, then tears down idle resources.

Errors:

- `ConnectionPoolError` (base)
- `ConnectionPoolTimeoutError` — thrown when an acquire exceeds `acquireTimeoutMs`
- `ConnectionPoolDrainedError` — thrown when acquiring from a draining/drained pool

Snapshot for metrics:

```ts
{
  name, state, size, idle, inUse, creating, waiters,
  stats: { acquires, releases, creates, destroys, validations,
           acquireTimeouts, validationFailures }
}
```

### 3.2 `createPooledDatabase` — integration with the shared Prisma client

`server/src/db/pooledDatabase.ts` — wraps the existing `prisma` singleton in a pool whose "connections" are lease tokens. Since better-sqlite3 is single-writer, we don't open multiple Prisma clients; the pool acts as a bounded FIFO queue over the one we already have. Every fee-bump request that opts in goes through `db.withConnection(client => ...)`, inheriting all the tuning knobs above.

Importantly, the pool's `destroy` is a no-op for this wrapper — destroying a *lease* does not disconnect the shared client. The `validate` hook defaults to a `SELECT 1` probe so unhealthy states surface immediately on acquire.

### 3.3 Environment knobs

`loadPooledDatabaseFromEnv(prisma)` reads five env vars so ops can tune without a rebuild:

```
FLUID_DB_POOL_MAX              default 20
FLUID_DB_POOL_MIN              default 0
FLUID_DB_POOL_ACQUIRE_TIMEOUT  default 5000   (ms)
FLUID_DB_POOL_IDLE_TIMEOUT     unset → disabled (ms)
FLUID_DB_POOL_MAX_LIFETIME     unset → disabled (ms)
```

## 4. How fee-bump handlers opt in

```ts
import { prisma } from "./utils/db";
import { loadPooledDatabaseFromEnv } from "./db/pooledDatabase";

const db = loadPooledDatabaseFromEnv(prisma);

// In a handler:
await db.withConnection(async (client) => {
  await client.transaction.create({ data: ... });
  await client.quotaCounter.update({ where: ..., data: ... });
});
```

Every concurrent fee-bump request that uses `db.withConnection` respects the pool ceiling. If the cap is hit, overflow requests queue in FIFO order and fail fast with `ConnectionPoolTimeoutError` instead of unbounded latency.

## 5. Edge cases covered

| # | Case                                                          | Test                                                                             |
| - | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1 | Basic acquire/release                                         | `acquires and releases the same resource`                                        |
| 2 | Idle reuse                                                    | `reuses idle resources on subsequent acquires`                                   |
| 3 | Up to `maxSize` concurrent creates                            | `creates up to maxSize concurrent resources`                                     |
| 4 | FIFO queue ordering                                           | `queues acquires beyond maxSize in FIFO order`                                   |
| 5 | Acquire timeout                                               | `rejects queued acquires with ConnectionPoolTimeoutError past acquireTimeoutMs`  |
| 6 | `withConnection` success path                                 | `withConnection runs callback then releases the lease`                           |
| 7 | `withConnection` destroys on callback error                   | `withConnection destroys the resource when callback throws`                      |
| 8 | Validation recycles dead resources                            | `validate hook recycles unhealthy resources`                                     |
| 9 | Invalid construction arguments                                | `rejects maxSize < 1 and invalid minSize`                                        |
| 10 | Idempotent release                                           | `release is idempotent`                                                           |
| 11 | Force-destroy on release                                     | `release({ destroy: true }) forces teardown`                                      |
| 12 | Warmup pre-creates `minSize`                                 | `warmup pre-creates minSize resources`                                            |
| 13 | Drain rejects queued and destroys idle                       | `drain rejects queued acquires and destroys idle resources`                       |
| 14 | Max lifetime recycling                                       | `maxLifetime recycles resources on release once expired`                          |
| 15 | Accurate concurrent snapshot                                 | `snapshot tracks concurrent state accurately`                                     |
| 16 | **500 concurrent callbacks through pool of 4**               | `serialises 500 concurrent callbacks through a pool of 4 with no overflow and no drops` |
| 17 | Mass timeout under pressure                                  | `rejects the waiters that would have breached the acquire deadline`               |
| 18 | Handoff before new create                                    | `hands the released resource to the next waiter before opening a new one`         |
| 19 | Pooled Prisma serialisation                                  | `serialises callbacks so no more than maxSize run concurrently`                   |
| 20 | Pooled Prisma timeout                                        | `rejects the overflow waiters with ConnectionPoolTimeoutError`                    |
| 21 | Default `SELECT 1` validator                                 | `default validate probes the client with SELECT 1 on acquire`                     |
| 22 | Validator failure recycles                                   | `recycles the lease when the validate probe fails`                                |
| 23 | Shared client is never disconnected                          | `shared client is never disconnected when a lease is destroyed`                   |
| 24 | Drain waits for in-flight                                    | `drain blocks until in-flight requests finish`                                    |

## 6. Performance and memory

- **O(1) per acquire/release** — idle/waiter lookups are array head ops; no hashing.
- **No timers per lease** — idle/lifetime eviction runs on a single periodic sweep (configurable, default 15s) that `.unref()`s itself so it never keeps the process alive.
- **Single acquire timer** — one `setTimeout` is armed only while a request is actually queued; it is cleared the moment the waiter is resolved.
- **Zero allocations on warm path** — released resources go straight back to the idle array; `withConnection` creates one closure per call.

## 7. Verification

See `server/verification/connection-pool-fine-tuning.md` for captured terminal output. TL;DR: all 24 tests pass; the 500-concurrent stress test verifies `peakInUse ≤ maxSize` and zero acquire drops under the FIFO queue.
