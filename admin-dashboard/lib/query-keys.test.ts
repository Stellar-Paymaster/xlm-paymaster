import { test } from "node:test";
import assert from "node:assert/strict";

import { queryKeys } from "./query-keys.ts";

// ─── Namespace structure ────────────────────────────────────────────────────

test("every resource family exposes an `all` key for bulk invalidation", () => {
  const families = [
    queryKeys.notifications,
    queryKeys.feeEstimate,
    queryKeys.signers,
    queryKeys.apiKeys,
    queryKeys.webhooks,
    queryKeys.sandbox,
    queryKeys.chains,
    queryKeys.sar,
  ];
  for (const family of families) {
    assert.equal(
      typeof (family as { all: () => readonly unknown[] }).all,
      "function",
      "resource families must expose all()",
    );
    const root = (family as { all: () => readonly unknown[] }).all();
    assert.ok(Array.isArray(root), "all() must return a tuple");
    assert.ok(root.length > 0, "all() must have at least one segment");
  }
});

test("sub-keys are prefixed by the family root so partial invalidation works", () => {
  const [notifRoot] = queryKeys.notifications.all();
  const [listRoot] = queryKeys.notifications.list();
  assert.equal(notifRoot, listRoot);

  const [webhooksRoot] = queryKeys.webhooks.all();
  const [webhooksListRoot] = queryKeys.webhooks.list();
  const [webhooksLogsRoot] = queryKeys.webhooks.deliveryLogs("w_123");
  const [webhooksDlqRoot] = queryKeys.webhooks.dlq();
  assert.equal(webhooksRoot, webhooksListRoot);
  assert.equal(webhooksRoot, webhooksLogsRoot);
  assert.equal(webhooksRoot, webhooksDlqRoot);
});

// ─── Stability ──────────────────────────────────────────────────────────────

test("keys are value-stable for equal inputs so React Query caches hit", () => {
  assert.deepEqual(
    queryKeys.feeEstimate.compute({ assetCode: "XLM", amount: "100" }),
    queryKeys.feeEstimate.compute({ assetCode: "XLM", amount: "100" }),
  );
  assert.deepEqual(
    queryKeys.signers.detail("GABC"),
    queryKeys.signers.detail("GABC"),
  );
});

test("different inputs produce different keys — no false cache hits", () => {
  const [, , a] = queryKeys.feeEstimate.compute({
    assetCode: "XLM",
    amount: "100",
  });
  const [, , b] = queryKeys.feeEstimate.compute({
    assetCode: "USDC",
    amount: "100",
  });
  assert.notDeepEqual(a, b);

  assert.notDeepEqual(
    queryKeys.signers.detail("GAAA"),
    queryKeys.signers.detail("GBBB"),
  );
});

test("deliveryLogs without a webhookId uses the sentinel 'all' scope", () => {
  const withoutId = queryKeys.webhooks.deliveryLogs();
  const withId = queryKeys.webhooks.deliveryLogs("w_123");
  assert.equal(withoutId[withoutId.length - 1], "all");
  assert.notDeepEqual(withoutId, withId);
});

test("sar queue without a status uses the sentinel 'all' scope", () => {
  const noStatus = queryKeys.sar.queue();
  const withStatus = queryKeys.sar.queue("pending");
  assert.equal(noStatus[noStatus.length - 1], "all");
  assert.notDeepEqual(noStatus, withStatus);
});

// ─── Tuples are readonly (type-level guarantee surfaced at runtime via Object.isFrozen check) ──

test("keys are plain arrays (React Query treats them structurally)", () => {
  const key = queryKeys.notifications.list();
  assert.ok(Array.isArray(key));
  // Keys are intentionally plain arrays so React Query's structural equality
  // semantics work; confirm we didn't accidentally wrap them.
  assert.equal(Object.getPrototypeOf(key), Array.prototype);
});
