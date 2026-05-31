import assert from "node:assert/strict";
import test from "node:test";
import { buildApiKeyUsageStats } from "./api-key-usage-data.ts";

const SAMPLE_KEYS = [
  {
    id: "key-active-01",
    key: "flud...1234",
    prefix: "flud",
    tenantId: "tenant-x",
    active: true,
  },
  {
    id: "key-revoked-02",
    key: "flud...5678",
    prefix: "flud",
    tenantId: "tenant-y",
    active: false,
  },
];

test("returns one stat per key", () => {
  const stats = buildApiKeyUsageStats(SAMPLE_KEYS);
  assert.equal(stats.length, SAMPLE_KEYS.length);
});

test("totalCount equals successCount plus failedCount", () => {
  const [stat] = buildApiKeyUsageStats(SAMPLE_KEYS);
  assert.equal(stat.totalCount, stat.successCount + stat.failedCount);
});

test("failureRatePct is bounded between 0 and 100", () => {
  const stats = buildApiKeyUsageStats(SAMPLE_KEYS);
  for (const stat of stats) {
    assert.ok(stat.failureRatePct >= 0, "failure rate must be non-negative");
    assert.ok(stat.failureRatePct <= 100, "failure rate must be at most 100");
  }
});

test("inactive keys have a higher failure rate than active keys", () => {
  const [active, inactive] = buildApiKeyUsageStats(SAMPLE_KEYS);
  assert.ok(
    inactive.failureRatePct > active.failureRatePct,
    "inactive keys should have higher failure rate",
  );
});

test("label includes key prefix and last four characters", () => {
  const [stat] = buildApiKeyUsageStats(SAMPLE_KEYS);
  assert.ok(stat.label.startsWith("flud"), "label should start with prefix");
  assert.ok(stat.label.includes("1234"), "label should include last four chars");
});

test("totalCostStroops equals successCount multiplied by 100", () => {
  const [stat] = buildApiKeyUsageStats(SAMPLE_KEYS);
  assert.equal(stat.totalCostStroops, stat.successCount * 100);
});

test("empty input returns empty array", () => {
  assert.deepEqual(buildApiKeyUsageStats([]), []);
});

test("keyId and tenantId are preserved from input", () => {
  const [stat] = buildApiKeyUsageStats(SAMPLE_KEYS);
  assert.equal(stat.keyId, "key-active-01");
  assert.equal(stat.tenantId, "tenant-x");
});
