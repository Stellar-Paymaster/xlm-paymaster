import assert from "node:assert/strict";
import test from "node:test";
import {
  extractActionCategories,
  filterAuditLogs,
  getAuditLogsData,
  normalizeAuditLogFilters,
  type AuditLogEntry,
} from "./audit-logs-data.ts";

const entries: AuditLogEntry[] = [
  {
    actionCategory: "Auth",
    actor: "admin@paymaster.dev",
    action: "auth.login_failed",
    aiSummary: "Failed login",
    createdAt: "2026-05-31T10:00:00.000Z",
    id: "one",
    ipAddress: "203.0.113.10",
    metadata: null,
    riskScore: 92,
    target: "admin@paymaster.dev",
  },
  {
    actionCategory: "API Key",
    actor: "system",
    action: "apikey.revoke",
    aiSummary: "Revoked key",
    createdAt: "2026-05-29T10:00:00.000Z",
    id: "two",
    ipAddress: "198.51.100.22",
    metadata: null,
    riskScore: 64,
    target: "key_1",
  },
  {
    actionCategory: "Signer",
    actor: "operator@paymaster.dev",
    action: "signer.add",
    aiSummary: null,
    createdAt: "2026-04-01T10:00:00.000Z",
    id: "three",
    ipAddress: null,
    metadata: null,
    riskScore: 18,
    target: "GABC",
  },
];

function withEnv(overrides: Partial<NodeJS.ProcessEnv>, callback: () => Promise<void>) {
  const originalEnv = process.env;
  process.env = { ...originalEnv, ...overrides };

  return callback().finally(() => {
    process.env = originalEnv;
  });
}

test("normalizeAuditLogFilters trims strings and clamps risk bounds", () => {
  assert.deepEqual(
    normalizeAuditLogFilters({
      actionCategory: " Auth ",
      ipAddress: " 203.0.113 ",
      maxRiskScore: 140,
      minRiskScore: -10,
    }),
    {
      actionCategory: "Auth",
      ipAddress: "203.0.113",
      maxRiskScore: 100,
      minRiskScore: 0,
      timePeriod: "all",
    },
  );
});

test("filterAuditLogs filters by IP, category, time period, and risk score", () => {
  const filtered = filterAuditLogs(
    entries,
    {
      actionCategory: "Auth",
      ipAddress: "203.0.113",
      minRiskScore: 80,
      timePeriod: "24h",
    },
    new Date("2026-05-31T12:00:00.000Z"),
  );

  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ["one"],
  );
});

test("filterAuditLogs handles empty result sets", () => {
  const filtered = filterAuditLogs(entries, {
    actionCategory: "Tenant",
    maxRiskScore: 10,
  });

  assert.equal(filtered.length, 0);
});

test("extractActionCategories returns sorted unique categories", () => {
  assert.deepEqual(extractActionCategories(entries), ["API Key", "Auth", "Signer"]);
});

test("getAuditLogsData forwards detailed filters to the live audit endpoint", async () => {
  const originalFetch = global.fetch;
  let requestedUrl = "";

  try {
    global.fetch = (async (url) => {
      requestedUrl = String(url);

      return {
        ok: true,
        json: async () => ({
          items: [
            {
              action: "auth.login_failed",
              actor: "admin@paymaster.dev",
              createdAt: "2026-05-31T10:00:00.000Z",
              id: "live-one",
              metadata: null,
              target: "admin@paymaster.dev",
            },
          ],
          limit: 25,
          offset: 0,
          total: 1,
        }),
      } as Response;
    }) as typeof fetch;

    await withEnv(
      {
        PAYMASTER_ADMIN_TOKEN: "admin-token",
        PAYMASTER_SERVER_URL: "https://server.paymaster.test/",
      },
      async () => {
        const data = await getAuditLogsData(25, 0, {
          actionCategory: "Auth",
          ipAddress: "203.0.113",
          minRiskScore: 50,
          timePeriod: "7d",
        });

        assert.equal(data.source, "live");
        assert.deepEqual(data.actionCategories, ["Auth"]);
        assert.equal(data.items[0].actionCategory, "Auth");
        assert.equal(data.items[0].riskScore, 0);
        assert.match(requestedUrl, /category=Auth/);
        assert.match(requestedUrl, /ip=203\.0\.113/);
        assert.match(requestedUrl, /minRiskScore=50/);
        assert.match(requestedUrl, /period=7d/);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
