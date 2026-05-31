# Web Worker Fallback Testing in Client SDK

**Issue:** #734  
**Package:** `client`

## Overview

Verifies that the Fluid Client SDK degrades gracefully when Web Workers are restricted by a browser's security policies (CSP `worker-src 'none'`, sandboxed iframes, Node.js environments, etc.).

## Test File

`client/src/workers/signingWorker.fallback.test.ts`

## Scenarios Covered

| Scenario | What is tested |
|---|---|
| `Worker` global is `undefined` | Client constructs without throwing; `terminate()` is safe |
| `Worker` constructor throws | Graceful fallback; client remains usable |
| `useWorker: false` | Worker constructor is never called |
| Runtime `onerror` event | Does not propagate; client stays alive |
| `terminate()` called multiple times | Idempotent – no throw |
| CSP policy strings | `worker-src 'none'`, `script-src 'self'`, generic violation |

## Running Tests

```bash
cd client
npx vitest run src/workers/signingWorker.fallback.test.ts
```
