# Mock Horizon Server Overhaul

**Issue:** #525 · Testing & QA  
**File:** `src/test/mockHorizonServer.ts`

## Overview

`MockHorizonServer` is a realistic in-process HTTP mock of the Stellar Horizon API. It is designed to replace simplistic test doubles with a configurable server that faithfully replicates production failure modes, enabling the failover client, fee estimator, and submission pipeline tests to exercise every code path.

## Key improvements over the previous mock

| Capability | Before | After |
|---|---|---|
| 504 gateway timeout | Not supported | Full stall simulation with configurable delay |
| Transient failures | Not supported | `failCount` — fail N times then recover |
| Per-path scenarios | Not supported | `pathScenarios` map |
| Retry-After headers | Missing | Present on 429 and 503 responses |
| Horizon error extras | Missing | `tx_bad_seq`, `tx_insufficient_fee`, `tx_failed` with `result_codes` |
| Connection reset | Not supported | Socket destroyed mid-request |
| Latency injection | Not supported | `latencyMs` configuration |
| Request capture | Not supported | `requests` array + `lastRequest()` |

## Usage

```typescript
import { MockHorizonServer } from "../test/mockHorizonServer";

const mock = new MockHorizonServer();
const { url } = await mock.start();

// Configure horizon client to point at mock
process.env.HORIZON_URL = url;

// Run tests...

await mock.stop();
```

### Simulating a 504 gateway timeout

```typescript
mock.configure({ defaultScenario: "gateway_timeout", latencyMs: 6_000 });

// The failover client should retry on a different node and succeed
const result = await horizonClient.submitTransaction(tx);
```

### Simulating transient failures (succeeds after 2 retries)

```typescript
mock.configure({ defaultScenario: "internal_error", failCount: 2 });

// First two requests return 500, third returns 200
```

### Per-path error injection

```typescript
mock.configure({
  defaultScenario: "none",
  pathScenarios: {
    "/transactions": "tx_bad_seq",
    "/fee_stats": "rate_limit",
  },
});
```

## Supported scenarios

| Scenario | HTTP Status | Details |
|---|---|---|
| `none` | 200 | Happy-path responses |
| `rate_limit` | 429 | `Retry-After: 1` header |
| `internal_error` | 500 | Horizon error JSON body |
| `bad_gateway` | 502 | Horizon error JSON body |
| `service_unavailable` | 503 | `Retry-After: 5` header |
| `gateway_timeout` | 504 | Delayed response (use `latencyMs`) |
| `connection_reset` | — | Socket destroyed; client receives ECONNRESET |
| `tx_bad_seq` | 400 | `result_codes.transaction: "tx_bad_seq"` |
| `tx_insufficient_fee` | 400 | `result_codes.transaction: "tx_insufficient_fee"` |
| `tx_failed` | 400 | `result_codes.transaction: "tx_failed"` |

## Supported happy-path routes

| Route | Method | Response |
|---|---|---|
| `/fee_stats` | GET | Fee statistics fixture |
| `/accounts/:id` | GET | Account fixture with balances |
| `/transactions` | POST | Transaction success fixture |
| `/transactions/:hash` | GET | Transaction by hash |
| `/ledgers` | GET | Ledger records fixture |
| `*` | any | 404 Not Found |

## API Reference

```typescript
class MockHorizonServer {
  constructor(config?: MockHorizonConfig);
  start(): Promise<{ url: string; port: number }>;
  stop(): Promise<void>;
  configure(patch: Partial<MockHorizonConfig>): void;
  reset(): void;
  get requests(): CapturedRequest[];
  lastRequest(): CapturedRequest | undefined;
  clearRequests(): void;
}
```

## Test strategy

Tests cover:
1. All happy-path routes return correct fixtures
2. All error scenarios return the correct status code and body structure
3. Retry-After headers are present where specified by Horizon API
4. `failCount` transitions from failing to healthy
5. Per-path overrides do not affect other paths
6. Latency injection adds measurable delay
7. Connection reset causes fetch to throw
