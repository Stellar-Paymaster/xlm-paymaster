import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

test.beforeEach(() => {
  globalThis.fetch = originalFetch;
});

test("marks a responsive endpoint as synced", async () => {
  globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch;

  const { getHorizonLatencyGridData } = await import("./horizon-monitor.ts");
  const [status] = await getHorizonLatencyGridData([
    { label: "Public Horizon", url: "https://horizon.stellar.org" },
  ]);

  assert.equal(status.label, "Public Horizon");
  assert.equal(status.online, true);
  assert.notEqual(status.latencyMs, null);
  assert.equal(status.syncStatus, "synced");
});

test("marks a failed endpoint as offline", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const { getHorizonLatencyGridData } = await import("./horizon-monitor.ts");
  const [status] = await getHorizonLatencyGridData([
    { label: "Sandbox Horizon", url: "http://localhost:8000" },
  ]);

  assert.equal(status.online, false);
  assert.equal(status.latencyMs, null);
  assert.equal(status.syncStatus, "offline");
});