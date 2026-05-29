# Request Idempotency

**Status:** Implemented — `server/src/middleware/idempotencyMiddleware.ts`
**Scope:** `server/`
**Risk area mitigated:** Double-processing mutations & double-charging accounts

## 1. Problem

API clients on poor network conditions may retry HTTP requests due to timeouts or dropped connections. If these mutations (e.g., funding an account, submitting a Soroban fee bump) are not uniquely identifiable, the system risks processing identical instructions multiple times, leading to duplicate charges or mismanaged ledger states.

## 2. Goal

Guarantee robust request idempotency to strictly enforce "exactly once" processing semantics for identical payloads via client-provided deterministic keys.

## 3. Architecture

We implemented a combination of an `IdempotencyService` and an Express middleware `idempotencyMiddleware`.

- **Identifier Lookup**: The middleware checks for `Idempotency-Key` or `X-Request-Id` headers.
- **Tenant Namespacing**: Keys are automatically namespaced (e.g., `tenantId:requestId`) to nullify cross-tenant key-collision attacks.
- **In-Memory Cache & LRU**: `IdempotencyService` efficiently caches response bodies using a bounded LRU fallback (maximum 10,000 entries) and a Time-To-Live (24h default) expiration mechanism to prevent memory leaks.

## 4. State Machine

1. **NEW**: Client requests endpoint with `Idempotency-Key: abc`. The service registers the key and sets state to `IN_PROGRESS`. Middleware continues to the controller.
2. **IN_PROGRESS (Concurrent / Retries)**: Additional requests with the same key received *before* the first controller completes are immediately rejected with `409 Conflict`.
3. **COMPLETED (Success)**: If the controller responds favorably (`HTTP >= 200 && < 300`), the middleware intercepts `res.send()` to cache the result. Future identically-keyed requests bypass the controller entirely and replay the cached payload and headers.
4. **ROLLBACK (Failures)**: Controller responses with HTTP `4xx` or `5xx` signal the middleware to erase the tracked key, empowering the client to safely retry the transaction without encountering `409 Conflict`.

## 5. Implementation Path

- `server/src/services/idempotencyService.ts` - The core store logic.
- `server/src/middleware/idempotencyMiddleware.ts` - The Express interceptor mechanism.

## 6. Testing

Test execution and validation resides in `vitest`. Complete boundaries (LRU sweeps, Concurrent 409s, Success caching) are tested via unit wrappers located in `.test.ts` neighboring files.