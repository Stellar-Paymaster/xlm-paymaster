# Brute-Force Protection for Admin Logins

**Status:** Implemented — `server/src/middleware/adminBruteForce.ts`
**Scope:** `server/`
**Risk area mitigated:** Credential stuffing, brute-force attacks

## 1. Problem

Admin authentication endpoints such as `/admin/auth/login` are prime targets for automated credential stuffing and brute-force attacks. Without rate limiting, an attacker could continuously guess passwords until they gain access to the system.

## 2. Goal

Implement a brute-force protection mechanism to lock out offending IPs and target emails after a certain number of failed login attempts.

## 3. Architecture

We created `adminBruteForceMiddleware`, an Express middleware interceptor designed specifically for authentication endpoints.

- **Dual-Tracking**: Tracks failed login attempts independently by IP address and by the supplied email address. This mitigates distributed attacks targeting a single account, as well as single IPs targeting multiple accounts.
- **Thresholds**: Defaults to 5 failed attempts before triggering a 15-minute lockout window.
- **Interception**: Passes the request to the route handler, and leverages the `finish` event on the response object to record the result seamlessly (increment on 401/403, reset on 2xx).
- **Redis Primary, In-Memory Fallback**: Uses Redis as the primary tracking store to ensure lockouts are enforced consistently across horizontally scaled replicas. Gracefully falls back to an in-memory `Map` if Redis is unavailable, avoiding service outages while preserving base protections.

## 4. Implementation Path

- `server/src/middleware/adminBruteForce.ts` - Middleware logic handling Redis integration, in-memory fallback, and response lifecycle hooking.
- `server/src/middleware/adminBruteForce.test.ts` - Comprehensive Vitest coverage validating the fallback resilience and limits.

## 5. Usage Example

```typescript
// Hooking the middleware strictly to authentication endpoints
app.post('/admin/auth/login', adminBruteForceMiddleware, loginController);
```

## 6. Testing

Tests run via `vitest` covering all branches, Redis integration mocks, and event lifecycle interceptions ensuring accurate tracking and limit protections.