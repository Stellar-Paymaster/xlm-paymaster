/**
 * Generic PgBouncer-style connection pool.
 *
 * Bounds concurrency over a set of reusable resources (Prisma clients, HTTP
 * agents, sockets, anything `T`). Gives callers the tuning knobs PgBouncer
 * exposes — keep-warm floor, hard ceiling, acquire-timeout queue, idle
 * eviction, and mandatory recycling by age — plus a snapshot for metrics
 * and a drain path for graceful shutdown.
 *
 * The pool itself is transport-agnostic; pair it with a factory that knows
 * how to open and close the underlying resource.
 */

export interface ConnectionPoolOptions<T> {
  /** Creates a new backend resource. Called up to `maxSize` times. */
  factory: () => Promise<T> | T;
  /** Disposes a resource (close socket, disconnect client, etc.). */
  destroy?: (resource: T) => Promise<void> | void;
  /**
   * Optional liveness probe run on every acquire. Returning `false` causes the
   * resource to be destroyed and a replacement created or queued.
   */
  validate?: (resource: T) => Promise<boolean> | boolean;
  /** Hard ceiling — pool will never hold more than this many resources. */
  maxSize: number;
  /** Keep this many resources warm. Default: 0. */
  minSize?: number;
  /** Reject queued acquires after this many ms. Default: 5_000. */
  acquireTimeoutMs?: number;
  /** Destroy idle resources that exceed this age. Default: disabled. */
  idleTimeoutMs?: number;
  /** Destroy resources older than this on release. Default: disabled. */
  maxLifetimeMs?: number;
  /** Periodic sweep for idle/lifetime eviction. Default: 15_000. */
  reapIntervalMs?: number;
  /** Label used in error messages and snapshots. Default: "pool". */
  name?: string;
}

export interface ConnectionPoolSnapshot {
  name: string;
  state: "active" | "draining" | "drained";
  size: number;
  idle: number;
  inUse: number;
  creating: number;
  waiters: number;
  stats: {
    acquires: number;
    releases: number;
    creates: number;
    destroys: number;
    validations: number;
    acquireTimeouts: number;
    validationFailures: number;
  };
}

export interface PooledLease<T> {
  resource: T;
  release(options?: { destroy?: boolean }): Promise<void>;
}

export class ConnectionPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionPoolError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConnectionPoolTimeoutError extends ConnectionPoolError {
  public readonly waitedMs: number;

  constructor(poolName: string, waitedMs: number) {
    super(
      `Acquire on connection pool "${poolName}" timed out after ${waitedMs}ms`,
    );
    this.name = "ConnectionPoolTimeoutError";
    this.waitedMs = waitedMs;
  }
}

export class ConnectionPoolDrainedError extends ConnectionPoolError {
  constructor(poolName: string) {
    super(`Connection pool "${poolName}" is draining or drained`);
    this.name = "ConnectionPoolDrainedError";
  }
}

interface PoolEntry<T> {
  resource: T;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
}

interface Waiter<T> {
  resolve(entry: PoolEntry<T>): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
  enqueuedAt: number;
}

type TimerHandle = ReturnType<typeof setInterval>;

export class ConnectionPool<T> {
  private readonly factory: ConnectionPoolOptions<T>["factory"];
  private readonly destroyFn: ConnectionPoolOptions<T>["destroy"];
  private readonly validateFn: ConnectionPoolOptions<T>["validate"];
  private readonly maxSize: number;
  private readonly minSize: number;
  private readonly acquireTimeoutMs: number;
  private readonly idleTimeoutMs: number | null;
  private readonly maxLifetimeMs: number | null;
  private readonly reapIntervalMs: number;
  private readonly name: string;

  private readonly entries: Array<PoolEntry<T>> = [];
  private readonly waiters: Array<Waiter<T>> = [];
  private creating = 0;
  private state: "active" | "draining" | "drained" = "active";
  private reaper: TimerHandle | null = null;

  private acquires = 0;
  private releases = 0;
  private creates = 0;
  private destroys = 0;
  private validations = 0;
  private acquireTimeouts = 0;
  private validationFailures = 0;

  constructor(options: ConnectionPoolOptions<T>) {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
      throw new TypeError("maxSize must be an integer >= 1");
    }
    const minSize = options.minSize ?? 0;
    if (!Number.isInteger(minSize) || minSize < 0 || minSize > options.maxSize) {
      throw new TypeError("minSize must be an integer in [0, maxSize]");
    }

    this.factory = options.factory;
    this.destroyFn = options.destroy;
    this.validateFn = options.validate;
    this.maxSize = options.maxSize;
    this.minSize = minSize;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 5_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? null;
    this.maxLifetimeMs = options.maxLifetimeMs ?? null;
    this.reapIntervalMs = options.reapIntervalMs ?? 15_000;
    this.name = options.name ?? "pool";

    if (this.idleTimeoutMs !== null || this.maxLifetimeMs !== null) {
      this.startReaper();
    }
  }

  async acquire(): Promise<PooledLease<T>> {
    if (this.state !== "active") {
      throw new ConnectionPoolDrainedError(this.name);
    }

    this.acquires += 1;
    const entry = await this.checkoutEntry();
    let released = false;

    return {
      resource: entry.resource,
      release: async ({ destroy = false } = {}) => {
        if (released) {
          return;
        }
        released = true;
        await this.returnEntry(entry, destroy);
      },
    };
  }

  async withConnection<R>(fn: (resource: T) => Promise<R> | R): Promise<R> {
    const lease = await this.acquire();
    let failed = false;
    try {
      return await fn(lease.resource);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // A faulted resource may be in a bad state; recycle it defensively.
      await lease.release({ destroy: failed });
    }
  }

  snapshot(): ConnectionPoolSnapshot {
    const idle = this.entries.filter((entry) => !entry.inUse).length;
    const inUse = this.entries.length - idle;
    return {
      name: this.name,
      state: this.state,
      size: this.entries.length,
      idle,
      inUse,
      creating: this.creating,
      waiters: this.waiters.length,
      stats: {
        acquires: this.acquires,
        releases: this.releases,
        creates: this.creates,
        destroys: this.destroys,
        validations: this.validations,
        acquireTimeouts: this.acquireTimeouts,
        validationFailures: this.validationFailures,
      },
    };
  }

  async drain(): Promise<void> {
    if (this.state === "drained") {
      return;
    }
    this.state = "draining";
    this.stopReaper();

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) continue;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(new ConnectionPoolDrainedError(this.name));
    }

    while (this.entries.some((entry) => entry.inUse)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }

    const toDestroy = this.entries.splice(0, this.entries.length);
    for (const entry of toDestroy) {
      await this.safeDestroy(entry.resource);
    }

    this.state = "drained";
  }

  private async checkoutEntry(): Promise<PoolEntry<T>> {
    const idle = this.entries.find((entry) => !entry.inUse);
    if (idle) {
      idle.inUse = true;
      const valid = await this.runValidation(idle);
      if (!valid) {
        await this.safeDestroy(idle.resource);
        this.removeEntry(idle);
        return this.checkoutEntry();
      }
      return idle;
    }

    if (this.entries.length + this.creating < this.maxSize) {
      return this.createAndCheckout();
    }

    return this.enqueueWaiter();
  }

  private async createAndCheckout(): Promise<PoolEntry<T>> {
    this.creating += 1;
    let resource: T;
    try {
      resource = await this.factory();
    } finally {
      this.creating -= 1;
    }

    this.creates += 1;
    const entry: PoolEntry<T> = {
      resource,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      inUse: true,
    };
    this.entries.push(entry);
    return entry;
  }

  private enqueueWaiter(): Promise<PoolEntry<T>> {
    return new Promise<PoolEntry<T>>((resolve, reject) => {
      const waiter: Waiter<T> = {
        resolve,
        reject,
        timer: null,
        enqueuedAt: Date.now(),
      };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) {
          this.waiters.splice(index, 1);
        }
        this.acquireTimeouts += 1;
        reject(
          new ConnectionPoolTimeoutError(this.name, this.acquireTimeoutMs),
        );
      }, this.acquireTimeoutMs);
      this.waiters.push(waiter);
    });
  }

  private async returnEntry(
    entry: PoolEntry<T>,
    forceDestroy: boolean,
  ): Promise<void> {
    this.releases += 1;
    entry.inUse = false;
    entry.lastUsedAt = Date.now();

    const overLifetime =
      this.maxLifetimeMs !== null &&
      Date.now() - entry.createdAt >= this.maxLifetimeMs;

    if (forceDestroy || overLifetime || this.state !== "active") {
      await this.safeDestroy(entry.resource);
      this.removeEntry(entry);
      this.handOffOrReplenish();
      return;
    }

    this.handOffOrReplenish(entry);
  }

  private handOffOrReplenish(reusable?: PoolEntry<T>): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      if (waiter.timer) clearTimeout(waiter.timer);
      if (reusable) {
        reusable.inUse = true;
        waiter.resolve(reusable);
        return;
      }
      // No reusable entry to hand off — create one fresh to honour the waiter.
      this.createAndCheckout().then(
        (entry) => waiter.resolve(entry),
        (error) => waiter.reject(error as Error),
      );
    }
  }

  private async runValidation(entry: PoolEntry<T>): Promise<boolean> {
    if (!this.validateFn) return true;
    this.validations += 1;
    try {
      const ok = await this.validateFn(entry.resource);
      if (!ok) {
        this.validationFailures += 1;
      }
      return ok;
    } catch {
      this.validationFailures += 1;
      return false;
    }
  }

  private async safeDestroy(resource: T): Promise<void> {
    this.destroys += 1;
    if (!this.destroyFn) return;
    try {
      await this.destroyFn(resource);
    } catch {
      // Destruction failures are swallowed intentionally: we are in a
      // teardown path and retrying would not help.
    }
  }

  private removeEntry(entry: PoolEntry<T>): void {
    const index = this.entries.indexOf(entry);
    if (index !== -1) {
      this.entries.splice(index, 1);
    }
  }

  private startReaper(): void {
    if (this.reaper) return;
    this.reaper = setInterval(() => {
      void this.reap();
    }, this.reapIntervalMs);
    if (typeof (this.reaper as { unref?: () => void }).unref === "function") {
      (this.reaper as unknown as { unref: () => void }).unref();
    }
  }

  private stopReaper(): void {
    if (!this.reaper) return;
    clearInterval(this.reaper);
    this.reaper = null;
  }

  private async reap(): Promise<void> {
    if (this.state !== "active") return;
    const now = Date.now();
    const victims: PoolEntry<T>[] = [];

    for (const entry of this.entries) {
      if (entry.inUse) continue;
      const lifetimeExceeded =
        this.maxLifetimeMs !== null &&
        now - entry.createdAt >= this.maxLifetimeMs;
      const idleTooLong =
        this.idleTimeoutMs !== null &&
        now - entry.lastUsedAt >= this.idleTimeoutMs;
      if (lifetimeExceeded || idleTooLong) {
        victims.push(entry);
      }
    }

    // Preserve the `minSize` floor of warm idle resources even when idle
    // eviction fires — we always destroy lifetime-exceeded entries.
    const idleEntries = this.entries.filter((entry) => !entry.inUse);
    let allowedToDestroy = Math.max(0, idleEntries.length - this.minSize);

    for (const victim of victims) {
      const lifetimeExceeded =
        this.maxLifetimeMs !== null &&
        now - victim.createdAt >= this.maxLifetimeMs;
      if (!lifetimeExceeded && allowedToDestroy <= 0) continue;
      this.removeEntry(victim);
      if (!lifetimeExceeded) allowedToDestroy -= 1;
      await this.safeDestroy(victim.resource);
    }
  }

  /**
   * Eagerly creates up to `minSize` resources so the first request doesn't
   * pay factory latency. Safe to call multiple times; extra calls no-op.
   */
  async warmup(): Promise<void> {
    if (this.state !== "active") {
      throw new ConnectionPoolDrainedError(this.name);
    }
    while (this.entries.length + this.creating < this.minSize) {
      const entry = await this.createAndCheckout();
      entry.inUse = false;
    }
  }
}
