import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConnectionPool,
  ConnectionPoolDrainedError,
  ConnectionPoolTimeoutError,
} from "./connectionPool";

interface FakeConn {
  id: number;
  alive: boolean;
  destroyed: boolean;
}

function makeFactory(): {
  factory: () => Promise<FakeConn>;
  destroy: (conn: FakeConn) => void;
  created: FakeConn[];
} {
  let counter = 0;
  const created: FakeConn[] = [];
  return {
    factory: async () => {
      counter += 1;
      const conn: FakeConn = { id: counter, alive: true, destroyed: false };
      created.push(conn);
      return conn;
    },
    destroy: (conn: FakeConn) => {
      conn.destroyed = true;
    },
    created,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ConnectionPool — unit", () => {
  it("acquires and releases the same resource", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 2 });

    const lease = await pool.acquire();
    expect(lease.resource.id).toBe(1);
    await lease.release();

    const snapshot = pool.snapshot();
    expect(snapshot.size).toBe(1);
    expect(snapshot.idle).toBe(1);
    expect(snapshot.inUse).toBe(0);
    expect(snapshot.stats.creates).toBe(1);
  });

  it("reuses idle resources on subsequent acquires", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 2 });

    const first = await pool.acquire();
    await first.release();
    const second = await pool.acquire();

    expect(second.resource.id).toBe(first.resource.id);
    expect(pool.snapshot().stats.creates).toBe(1);
    await second.release();
  });

  it("creates up to maxSize concurrent resources", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 3 });

    const leases = await Promise.all([
      pool.acquire(),
      pool.acquire(),
      pool.acquire(),
    ]);
    const ids = leases.map((lease) => lease.resource.id).sort();
    expect(ids).toEqual([1, 2, 3]);
    expect(created).toHaveLength(3);

    for (const lease of leases) await lease.release();
  });

  it("queues acquires beyond maxSize in FIFO order", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 1,
      acquireTimeoutMs: 1_000,
    });

    const first = await pool.acquire();
    expect(first.resource.id).toBe(1);

    const secondPromise = pool.acquire();
    const thirdPromise = pool.acquire();

    expect(pool.snapshot().waiters).toBe(2);

    await first.release();
    const second = await secondPromise;
    expect(second.resource.id).toBe(1);
    await second.release();

    const third = await thirdPromise;
    expect(third.resource.id).toBe(1);
    await third.release();
  });

  it("rejects queued acquires with ConnectionPoolTimeoutError past acquireTimeoutMs", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 1,
      acquireTimeoutMs: 40,
    });

    const held = await pool.acquire();
    const waiter = pool.acquire();
    await expect(waiter).rejects.toBeInstanceOf(ConnectionPoolTimeoutError);
    expect(pool.snapshot().stats.acquireTimeouts).toBe(1);

    await held.release();
  });

  it("withConnection runs callback then releases the lease", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 1 });

    const result = await pool.withConnection(async (conn) => {
      return conn.id * 10;
    });
    expect(result).toBe(10);
    expect(pool.snapshot().idle).toBe(1);
  });

  it("withConnection destroys the resource when callback throws", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 1 });

    await expect(
      pool.withConnection(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(created[0].destroyed).toBe(true);
    expect(pool.snapshot().size).toBe(0);
    expect(pool.snapshot().stats.destroys).toBe(1);
  });

  it("validate hook recycles unhealthy resources", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 2,
      validate: (conn) => conn.alive,
    });

    const first = await pool.acquire();
    created[0].alive = false;
    await first.release();

    const second = await pool.acquire();
    // The dead resource was destroyed and a fresh one was created.
    expect(second.resource.id).toBe(2);
    expect(created[0].destroyed).toBe(true);
    expect(pool.snapshot().stats.validationFailures).toBe(1);
    await second.release();
  });

  it("rejects maxSize < 1 and invalid minSize", () => {
    const { factory } = makeFactory();
    expect(
      () => new ConnectionPool({ factory, maxSize: 0 }),
    ).toThrow(TypeError);
    expect(
      () => new ConnectionPool({ factory, maxSize: 2, minSize: 5 }),
    ).toThrow(TypeError);
    expect(
      () => new ConnectionPool({ factory, maxSize: 2, minSize: -1 }),
    ).toThrow(TypeError);
  });

  it("release is idempotent", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 1 });

    const lease = await pool.acquire();
    await lease.release();
    await lease.release(); // second release is a no-op

    expect(pool.snapshot().idle).toBe(1);
    expect(pool.snapshot().inUse).toBe(0);
    expect(pool.snapshot().stats.releases).toBe(1);
  });

  it("release({ destroy: true }) forces teardown", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 1 });

    const lease = await pool.acquire();
    await lease.release({ destroy: true });
    expect(created[0].destroyed).toBe(true);
    expect(pool.snapshot().size).toBe(0);
  });

  it("warmup pre-creates minSize resources", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 5,
      minSize: 3,
    });

    await pool.warmup();
    const snap = pool.snapshot();
    expect(snap.idle).toBe(3);
    expect(snap.inUse).toBe(0);
    expect(snap.stats.creates).toBe(3);
  });

  it("drain rejects queued acquires and destroys idle resources", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 1,
      acquireTimeoutMs: 1_000,
    });

    const held = await pool.acquire();
    const queued = pool.acquire();

    const drainPromise = pool.drain();
    await expect(queued).rejects.toBeInstanceOf(ConnectionPoolDrainedError);
    await held.release();
    await drainPromise;

    expect(created[0].destroyed).toBe(true);
    expect(pool.snapshot().state).toBe("drained");
    await expect(pool.acquire()).rejects.toBeInstanceOf(
      ConnectionPoolDrainedError,
    );
  });

  it("maxLifetime recycles resources on release once expired", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 1,
      maxLifetimeMs: 10,
      reapIntervalMs: 5_000,
    });

    const first = await pool.acquire();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await first.release();

    expect(created[0].destroyed).toBe(true);
    expect(pool.snapshot().size).toBe(0);
    expect(pool.snapshot().stats.destroys).toBeGreaterThanOrEqual(1);
  });

  it("snapshot tracks concurrent state accurately", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({ factory, destroy, maxSize: 3 });

    const leases = await Promise.all([pool.acquire(), pool.acquire()]);
    let snap = pool.snapshot();
    expect(snap).toMatchObject({ size: 2, idle: 0, inUse: 2, waiters: 0 });

    await leases[0].release();
    snap = pool.snapshot();
    expect(snap).toMatchObject({ size: 2, idle: 1, inUse: 1 });

    await leases[1].release();
    snap = pool.snapshot();
    expect(snap).toMatchObject({ size: 2, idle: 2, inUse: 0 });
    expect(snap.stats.acquires).toBe(2);
    expect(snap.stats.releases).toBe(2);
  });
});

describe("ConnectionPool — integration (concurrent load, fee-bump pattern)", () => {
  it("serialises 500 concurrent callbacks through a pool of 4 with no overflow and no drops", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 4,
      acquireTimeoutMs: 30_000,
    });

    let peakInUse = 0;
    const completions = await Promise.all(
      Array.from({ length: 500 }, (_, index) =>
        pool.withConnection(async (conn) => {
          peakInUse = Math.max(peakInUse, pool.snapshot().inUse);
          // Simulate a DB round-trip for the fee-bump request.
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { index, connId: conn.id };
        }),
      ),
    );

    expect(completions).toHaveLength(500);
    expect(peakInUse).toBeLessThanOrEqual(4);
    const snap = pool.snapshot();
    expect(snap.stats.acquires).toBe(500);
    expect(snap.stats.releases).toBe(500);
    expect(snap.stats.acquireTimeouts).toBe(0);
    // No more than maxSize distinct resources were ever created.
    const distinctConns = new Set(completions.map((completion) => completion.connId));
    expect(distinctConns.size).toBeLessThanOrEqual(4);
  });

  it("rejects the waiters that would have breached the acquire deadline", async () => {
    const { factory, destroy } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 1,
      acquireTimeoutMs: 30,
    });

    const first = pool.withConnection(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "ok";
    });

    const contenders = Promise.allSettled(
      Array.from({ length: 5 }, () => pool.acquire()),
    );

    const results = await contenders;
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected.length).toBe(5);
    for (const result of rejected) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ConnectionPoolTimeoutError);
      }
    }

    await first;
    expect(pool.snapshot().stats.acquireTimeouts).toBe(5);
  });

  it("hands the released resource to the next waiter before opening a new one", async () => {
    const { factory, destroy, created } = makeFactory();
    const pool = new ConnectionPool<FakeConn>({
      factory,
      destroy,
      maxSize: 2,
      acquireTimeoutMs: 1_000,
    });

    const a = await pool.acquire();
    const b = await pool.acquire();
    expect(created).toHaveLength(2);

    const waiterDef = createDeferred<number>();
    const waiterPromise = pool.acquire().then((lease) => {
      const id = lease.resource.id;
      waiterDef.resolve(id);
      return lease;
    });

    await a.release();
    const wakingId = await waiterDef.promise;
    expect(wakingId).toBe(a.resource.id);

    const reused = await waiterPromise;
    await reused.release();
    await b.release();
    // No extra creations beyond the initial two.
    expect(created).toHaveLength(2);
  });
});
