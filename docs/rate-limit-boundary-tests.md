# Rate-Limit Window Boundary Tests (#728)

Precise boundary tests verify rate-limit behavior at window edges — e.g. the 59th second of a 60-second window.

## Coverage

| Component | Algorithm | Test file |
|-----------|-----------|-----------|
| API key fallback | GCRA leaky bucket | `server/src/utils/gcraBoundary.test.ts` |
| IP limiter store | Fixed INCR+EXPIRE | `server/src/utils/redisRateLimitStore.test.ts` |
| Sandbox guard | Fixed window | `server/src/middleware/sandboxGuard.boundary.test.ts` |
| gRPC rate limiter | Sliding window | `paymaster-server/src/rate_limiter.rs` (inline tests) |

## Shared GCRA implementation

The pure GCRA function lives in `server/src/utils/gcraLeakyBucket.ts` and is used by both the in-memory fallback (`rateLimit.ts`) and boundary tests, ensuring parity with the Redis Lua script.

## Running tests

```bash
cd server
npm test -- gcraBoundary redisRateLimitStore sandboxGuard.boundary

cd ../paymaster-server
cargo test rate_limiter
```

## Key boundary scenarios

1. **GCRA**: Full burst at t=0, rejection at t=59s, allowance after t=60s
2. **Fixed window**: Classic double-capacity burst (N requests at end + N at start of next window)
3. **Sliding window (Rust)**: Requests expire precisely at `window_ms` elapsed
