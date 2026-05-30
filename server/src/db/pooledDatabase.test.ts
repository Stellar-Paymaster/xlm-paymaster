import { describe, expect, it, vi } from "vitest";

import { ConnectionPoolTimeoutError } from "./connectionPool";
import { createPooledDatabase } from "./pooledDatabase";

function makeFakePrisma() {
  const queryRaw = vi.fn(async () => [{ "1": 1 }]);
  return {
    queryRaw,
    client: {
      $queryRaw: queryRaw,
      $disconnect: vi.fn(async () => undefined),
    },
  };
}

describe("createPooledDatabase", () => {
  it("serialises callbacks so no more than maxSize run concurrently", async () => {
    const { client } = makeFakePrisma();
    const db = createPooledDatabase({ client, maxSize: 2 });

    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.withConnection(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 2));
          running -= 1;
          return running;
        }),
      ),
    );

    expect(results).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(2);
    const snap = db.snapshot();
    expect(snap.stats.acquires).toBe(20);
    expect(snap.stats.releases).toBe(20);
  });

  it("rejects the overflow waiters with ConnectionPoolTimeoutError", async () => {
    const { client } = makeFakePrisma();
    const db = createPooledDatabase({
      client,
      maxSize: 1,
      acquireTimeoutMs: 25,
    });

    const slow = db.withConnection(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    await expect(
      db.withConnection(async () => "not reached"),
    ).rejects.toBeInstanceOf(ConnectionPoolTimeoutError);

    await slow;
    expect(db.snapshot().stats.acquireTimeouts).toBe(1);
  });

  it("default validate probes the client with SELECT 1 on acquire", async () => {
    const { client, queryRaw } = makeFakePrisma();
    const db = createPooledDatabase({ client, maxSize: 1 });

    // First acquire — validation skipped because the entry is fresh.
    await db.withConnection(async () => undefined);
    expect(queryRaw).not.toHaveBeenCalled();

    // Second acquire reuses the idle entry and must validate it.
    await db.withConnection(async () => undefined);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const call = queryRaw.mock.calls[0];
    expect(call[0]).toEqual(expect.arrayContaining([expect.stringContaining("SELECT 1")]));
  });

  it("recycles the lease when the validate probe fails", async () => {
    const { client } = makeFakePrisma();
    // First acquire: no validation runs (fresh resource). Second acquire sees
    // an idle entry and validates it — that is the first $queryRaw call we
    // want to fail. Subsequent validations succeed.
    client.$queryRaw = vi
      .fn()
      .mockRejectedValueOnce(new Error("db gone"))
      .mockResolvedValue([{ "1": 1 }]);

    const db = createPooledDatabase({ client, maxSize: 1 });

    await db.withConnection(async () => undefined);
    await db.withConnection(async () => undefined);

    expect(db.snapshot().stats.validationFailures).toBe(1);
  });

  it("shared client is never disconnected when a lease is destroyed", async () => {
    const { client } = makeFakePrisma();
    const db = createPooledDatabase({ client, maxSize: 1 });

    await expect(
      db.withConnection(async () => {
        throw new Error("forced error");
      }),
    ).rejects.toThrow("forced error");

    // $disconnect must NOT be called — otherwise future requests would fail
    // because the singleton client would be torn down.
    expect(client.$disconnect).not.toHaveBeenCalled();
  });

  it("drain blocks until in-flight requests finish", async () => {
    const { client } = makeFakePrisma();
    const db = createPooledDatabase({ client, maxSize: 2 });

    let finished = 0;
    const inflight = Promise.all([
      db.withConnection(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        finished += 1;
      }),
      db.withConnection(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        finished += 1;
      }),
    ]);

    const drain = db.drain();
    await inflight;
    await drain;

    expect(finished).toBe(2);
    expect(db.snapshot().state).toBe("drained");
  });
});
