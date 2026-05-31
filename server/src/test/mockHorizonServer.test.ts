import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { MockHorizonServer } from "./mockHorizonServer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get(url: string, timeoutMs = 3_000): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

async function post(url: string, body: string, timeoutMs = 3_000): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("MockHorizonServer — happy path", () => {
  const mock = new MockHorizonServer();
  let baseUrl: string;

  beforeAll(async () => {
    const { url } = await mock.start();
    baseUrl = url;
  });

  afterAll(async () => {
    await mock.stop();
  });

  afterEach(() => {
    mock.reset();
  });

  it("responds 200 to GET /fee_stats", async () => {
    const res = await get(`${baseUrl}/fee_stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("last_ledger");
    expect(body).toHaveProperty("min_accepted_fee");
  });

  it("responds 200 to GET /accounts/:id", async () => {
    const accountId = "GTEST1234567890ABCDEFGHIJKLMNOPQRST";
    const res = await get(`${baseUrl}/accounts/${accountId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account_id).toBe(accountId);
  });

  it("responds 200 to POST /transactions", async () => {
    const res = await post(`${baseUrl}/transactions`, "tx=AAAA");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("hash");
    expect(body).toHaveProperty("ledger");
  });

  it("responds 200 to GET /transactions/:hash", async () => {
    const res = await get(`${baseUrl}/transactions/deadbeef`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hash).toBe("deadbeef");
  });

  it("responds 200 to GET /ledgers", async () => {
    const res = await get(`${baseUrl}/ledgers`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._embedded.records[0]).toHaveProperty("sequence");
  });

  it("responds 404 for unknown paths", async () => {
    const res = await get(`${baseUrl}/unknown/path`);
    expect(res.status).toBe(404);
  });

  it("captures requests in the log", async () => {
    await get(`${baseUrl}/fee_stats`);
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].path).toBe("/fee_stats");
  });

  it("clearRequests empties the log", async () => {
    await get(`${baseUrl}/fee_stats`);
    mock.clearRequests();
    expect(mock.requests).toHaveLength(0);
  });
});

describe("MockHorizonServer — error simulations", () => {
  const mock = new MockHorizonServer();
  let baseUrl: string;

  beforeAll(async () => {
    const { url } = await mock.start();
    baseUrl = url;
  });

  afterAll(async () => {
    await mock.stop();
  });

  afterEach(() => {
    mock.reset();
  });

  it("simulates 429 Rate Limit with Retry-After header", async () => {
    mock.configure({ defaultScenario: "rate_limit" });
    const res = await get(`${baseUrl}/fee_stats`);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
    const body = await res.json();
    expect(body.status).toBe(429);
  });

  it("simulates 500 Internal Server Error", async () => {
    mock.configure({ defaultScenario: "internal_error" });
    const res = await get(`${baseUrl}/fee_stats`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.title).toBe("Internal Server Error");
  });

  it("simulates 502 Bad Gateway", async () => {
    mock.configure({ defaultScenario: "bad_gateway" });
    const res = await get(`${baseUrl}/fee_stats`);
    expect(res.status).toBe(502);
  });

  it("simulates 503 Service Unavailable with Retry-After", async () => {
    mock.configure({ defaultScenario: "service_unavailable" });
    const res = await get(`${baseUrl}/fee_stats`);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
  });

  it("simulates 504 Gateway Timeout (delayed response)", async () => {
    mock.configure({ defaultScenario: "gateway_timeout", latencyMs: 100 });
    const res = await get(`${baseUrl}/fee_stats`, 5_000);
    expect(res.status).toBe(504);
  });

  it("simulates tx_bad_seq error", async () => {
    mock.configure({ defaultScenario: "tx_bad_seq" });
    const res = await post(`${baseUrl}/transactions`, "tx=AAAA");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.extras.result_codes.transaction).toBe("tx_bad_seq");
  });

  it("simulates tx_insufficient_fee error", async () => {
    mock.configure({ defaultScenario: "tx_insufficient_fee" });
    const res = await post(`${baseUrl}/transactions`, "tx=AAAA");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.extras.result_codes.transaction).toBe("tx_insufficient_fee");
  });

  it("simulates tx_failed error", async () => {
    mock.configure({ defaultScenario: "tx_failed" });
    const res = await post(`${baseUrl}/transactions`, "tx=AAAA");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.extras.result_codes.transaction).toBe("tx_failed");
  });

  it("simulates connection reset (socket destroyed)", async () => {
    mock.configure({ defaultScenario: "connection_reset" });
    await expect(get(`${baseUrl}/fee_stats`)).rejects.toThrow();
  });
});

describe("MockHorizonServer — per-path overrides", () => {
  const mock = new MockHorizonServer();
  let baseUrl: string;

  beforeAll(async () => {
    const { url } = await mock.start();
    baseUrl = url;
  });

  afterAll(async () => {
    await mock.stop();
  });

  afterEach(() => {
    mock.reset();
  });

  it("applies per-path scenario while defaulting other paths to happy-path", async () => {
    mock.configure({
      defaultScenario: "none",
      pathScenarios: {
        "/transactions": "internal_error",
      },
    });

    const feeRes = await get(`${baseUrl}/fee_stats`);
    expect(feeRes.status).toBe(200);

    const txRes = await post(`${baseUrl}/transactions`, "tx=AAAA");
    expect(txRes.status).toBe(500);
  });

  it("overrides /fee_stats with rate_limit, /transactions stays 200", async () => {
    mock.configure({
      defaultScenario: "none",
      pathScenarios: { "/fee_stats": "rate_limit" },
    });

    const feeRes = await get(`${baseUrl}/fee_stats`);
    expect(feeRes.status).toBe(429);

    const txRes = await post(`${baseUrl}/transactions`, "tx=AAAA");
    expect(txRes.status).toBe(200);
  });
});

describe("MockHorizonServer — transient failure simulation", () => {
  const mock = new MockHorizonServer();
  let baseUrl: string;

  beforeAll(async () => {
    const { url } = await mock.start();
    baseUrl = url;
  });

  afterAll(async () => {
    await mock.stop();
  });

  afterEach(() => {
    mock.reset();
  });

  it("fails exactly N times then recovers", async () => {
    mock.configure({ defaultScenario: "internal_error", failCount: 2 });

    const first = await get(`${baseUrl}/fee_stats`);
    expect(first.status).toBe(500);

    const second = await get(`${baseUrl}/fee_stats`);
    expect(second.status).toBe(500);

    // After failCount=2 failures the mock auto-resets to "none"
    const third = await get(`${baseUrl}/fee_stats`);
    expect(third.status).toBe(200);
  });
});

describe("MockHorizonServer — latency injection", () => {
  const mock = new MockHorizonServer({ latencyMs: 100 });
  let baseUrl: string;

  beforeAll(async () => {
    const { url } = await mock.start();
    baseUrl = url;
  });

  afterAll(async () => {
    await mock.stop();
  });

  it("adds configured latency to responses", async () => {
    const start = Date.now();
    await get(`${baseUrl}/fee_stats`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90); // allow slight timer variance
  });

  it("configure() can reduce latency at runtime", async () => {
    mock.configure({ latencyMs: 0 });
    const start = Date.now();
    await get(`${baseUrl}/fee_stats`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
