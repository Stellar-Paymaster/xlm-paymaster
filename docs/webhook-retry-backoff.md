# Webhook Retry Backoff Logic (#723)

**Issue:** #723  
**Package:** `server`

## Overview

Failed webhook deliveries are retried via BullMQ with exponential backoff. The delay helpers in `webhookBackoff.ts` compute the next attempt timestamp and are unit-tested to ensure retries respect configured timers.

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `attempts` | 5 | Maximum BullMQ retry attempts |
| `backoff.type` | `exponential` | Doubles delay each attempt |
| `backoff.delay` | `60000` ms | Base delay (1 minute) |

## Backoff Schedule

| Attempt | Delay before retry |
|---------|-------------------|
| 0 (1st failure) | 1 min |
| 1 | 2 min |
| 2 | 4 min |
| 3 | 8 min |
| 4 | 16 min |

After 5 failed attempts the delivery moves to the DLQ.

## Implementation

| File | Purpose |
|------|---------|
| `server/src/services/webhookBackoff.ts` | Pure backoff calculation helpers |
| `server/src/services/webhookBackoff.test.ts` | Unit + property-based tests |
| `server/src/services/webhook.ts` | BullMQ worker uses `calculateWebhookNextAttempt` |

## API

```typescript
import {
  calculateWebhookNextAttempt,
  isWebhookRetryDue,
  shouldRetryWebhookDelivery,
} from "./services/webhookBackoff";

// After attempt 2 fails at 12:00:00
const next = calculateWebhookNextAttempt({ attemptsMade: 2 });
// → 12:04:00 (now + 4 minutes)

if (isWebhookRetryDue(delivery.nextAttempt)) {
  // safe to retry
}
```

## Running Tests

```bash
cd server
pnpm exec vitest run src/services/webhookBackoff.test.ts
```

## Edge Cases

- **Negative `attemptsMade`**: Treated as attempt 0 (minimum exponent = 0).
- **Null `nextAttempt`**: `isWebhookRetryDue` returns true (immediate retry allowed).
- **Overdue retry**: `millisecondsUntilNextWebhookRetry` returns negative value.
- **Max attempts exceeded**: `shouldRetryWebhookDelivery(5)` returns false; DLQ handler fires.
