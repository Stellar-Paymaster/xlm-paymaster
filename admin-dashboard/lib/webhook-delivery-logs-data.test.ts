import assert from "node:assert/strict";
import test from "node:test";
import { getWebhookDeliveryLogsData } from "./webhook-delivery-logs-data.ts";

test("getWebhookDeliveryLogsData returns sample source by default", async () => {
  const result = await getWebhookDeliveryLogsData();
  assert.equal(result.source, "sample");
});

test("getWebhookDeliveryLogsData returns the first page of rows", async () => {
  const result = await getWebhookDeliveryLogsData(1, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.equal(result.totalRows, 5);
  assert.equal(result.totalPages, 3);
});

test("getWebhookDeliveryLogsData paginates correctly", async () => {
  const page1 = await getWebhookDeliveryLogsData(1, 3);
  const page2 = await getWebhookDeliveryLogsData(2, 3);

  assert.equal(page1.rows.length, 3);
  assert.equal(page2.rows.length, 2);
  assert.notEqual(page1.rows[0].id, page2.rows[0].id);
});

test("getWebhookDeliveryLogsData rows include requestPayload and responseHeaders", async () => {
  const { rows } = await getWebhookDeliveryLogsData(1, 10);

  for (const row of rows) {
    assert.ok(
      typeof row.requestPayload === "object" && row.requestPayload !== null,
      `row ${row.id} missing requestPayload`,
    );
    assert.ok(
      typeof row.responseHeaders === "object" && row.responseHeaders !== null,
      `row ${row.id} missing responseHeaders`,
    );
  }
});

test("getWebhookDeliveryLogsData reflects provided sort and search in response", async () => {
  const result = await getWebhookDeliveryLogsData(
    1,
    10,
    "acme",
    "time_asc",
    [],
    [],
    [],
  );
  assert.equal(result.sort, "time_asc");
  assert.equal(result.search, "acme");
});

test("getWebhookDeliveryLogsData returns empty rows for out-of-range page", async () => {
  const result = await getWebhookDeliveryLogsData(999, 10);
  assert.equal(result.rows.length, 0);
  assert.equal(result.page, 999);
});

test("getWebhookDeliveryLogsData sample contains all expected delivery statuses", async () => {
  const { rows } = await getWebhookDeliveryLogsData(1, 10);
  const statuses = new Set(rows.map((r) => r.status));

  assert.ok(statuses.has("success"), "expected at least one success row");
  assert.ok(statuses.has("failed"), "expected at least one failed row");
  assert.ok(statuses.has("pending"), "expected at least one pending row");
  assert.ok(statuses.has("retrying"), "expected at least one retrying row");
});
