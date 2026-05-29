/**
 * Wraps the shared Prisma client in a PgBouncer-style concurrency limiter.
 *
 * The backing better-sqlite3 adapter is single-writer, so we don't actually
 * open multiple Prisma clients — we use the pool as a bounded FIFO queue of
 * lease tokens that throttle how many fee-bump requests can run DB work at
 * once, with the same tuning knobs PgBouncer exposes (pool size, acquire
 * timeout, idle / lifetime recycling, health validation, drain).
 *
 * Config is env-driven so ops can turn the knobs without a code deploy.
 */

import {
  ConnectionPool,
  ConnectionPoolOptions,
  ConnectionPoolSnapshot,
} from "./connectionPool";

type PrismaLike = {
  $queryRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  $disconnect?: () => Promise<void>;
};

export interface PooledDatabase<TPrisma extends PrismaLike> {
  withConnection<R>(fn: (client: TPrisma) => Promise<R> | R): Promise<R>;
  snapshot(): ConnectionPoolSnapshot;
  drain(): Promise<void>;
  warmup(): Promise<void>;
}

export interface PooledDatabaseOptions<TPrisma extends PrismaLike>
  extends Partial<Omit<ConnectionPoolOptions<TPrisma>, "factory" | "destroy">> {
  client: TPrisma;
  maxSize: number;
}

/**
 * Builds a pool whose "connections" are lease tokens over the supplied shared
 * Prisma client. `withConnection` is the hot path — acquire a token, run the
 * callback, release. Guarantees at most `maxSize` callbacks run concurrently,
 * with queued acquires honoured in FIFO order and rejected on timeout.
 */
export function createPooledDatabase<TPrisma extends PrismaLike>(
  options: PooledDatabaseOptions<TPrisma>,
): PooledDatabase<TPrisma> {
  const { client, ...poolOptions } = options;

  const pool = new ConnectionPool<TPrisma>({
    name: options.name ?? "prisma",
    acquireTimeoutMs: options.acquireTimeoutMs,
    idleTimeoutMs: options.idleTimeoutMs,
    maxLifetimeMs: options.maxLifetimeMs,
    reapIntervalMs: options.reapIntervalMs,
    maxSize: options.maxSize,
    minSize: options.minSize,
    validate: options.validate ?? defaultValidate(client),
    factory: () => client,
    // The client is shared — destroying a lease must not disconnect it,
    // or every expired lease would kill the singleton.
    destroy: () => undefined,
  });

  return {
    withConnection: (fn) => pool.withConnection(fn),
    snapshot: () => pool.snapshot(),
    drain: () => pool.drain(),
    warmup: () => pool.warmup(),
  };
}

function defaultValidate<TPrisma extends PrismaLike>(
  client: TPrisma,
): (resource: TPrisma) => Promise<boolean> {
  // Validation probes the shared client, not the lease, because the lease is
  // just a token. Ran only on acquire, so this is a light `SELECT 1`.
  return async () => {
    try {
      await client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  };
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Convenience loader — reads PgBouncer-style knobs from the environment so
 * pool sizing is tunable without a rebuild.
 *
 *   FLUID_DB_POOL_MAX              default 20  (max_client_conn)
 *   FLUID_DB_POOL_MIN              default 0   (default_pool_size floor)
 *   FLUID_DB_POOL_ACQUIRE_TIMEOUT  default 5000  (query_wait_timeout ms)
 *   FLUID_DB_POOL_IDLE_TIMEOUT     unset → disabled  (server_idle_timeout ms)
 *   FLUID_DB_POOL_MAX_LIFETIME     unset → disabled  (server_lifetime ms)
 */
export function loadPooledDatabaseFromEnv<TPrisma extends PrismaLike>(
  client: TPrisma,
): PooledDatabase<TPrisma> {
  return createPooledDatabase<TPrisma>({
    client,
    name: "prisma",
    maxSize: parsePositiveInt(process.env.FLUID_DB_POOL_MAX, 20),
    minSize: parsePositiveInt(process.env.FLUID_DB_POOL_MIN, 0),
    acquireTimeoutMs: parsePositiveInt(
      process.env.FLUID_DB_POOL_ACQUIRE_TIMEOUT,
      5_000,
    ),
    idleTimeoutMs: parseOptionalPositiveInt(process.env.FLUID_DB_POOL_IDLE_TIMEOUT),
    maxLifetimeMs: parseOptionalPositiveInt(process.env.FLUID_DB_POOL_MAX_LIFETIME),
  });
}
