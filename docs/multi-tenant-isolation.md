# Multi-Tenant Account and Balance Isolation

## Overview

Every sponsored transaction pool, API key, and configuration record in the
`server` package is scoped to a `Tenant` row via a `tenantId` foreign key.
The isolation layer ensures no query can return data belonging to a different
tenant, even if a caller passes an arbitrary ID.

## Components

### Middleware — `tenantIsolationMiddleware`

**File:** `server/src/middleware/tenantIsolation.ts`

Place this middleware after `apiKeyMiddleware` on any route that performs
tenant-scoped database access:

```typescript
router.get(
  "/my/resource",
  apiKeyMiddleware,
  tenantIsolationMiddleware,
  myHandler
);
```

The middleware extracts `tenantId` from the resolved `ApiKeyConfig` and stores
it in `res.locals.tenantId`.  If no API key context is present it calls
`next(AppError(..., 401))`.

### Helper — `requireTenantId`

Retrieve the tenant context inside a handler:

```typescript
import { requireTenantId } from "../middleware/tenantIsolation";

export async function myHandler(req: Request, res: Response) {
  const tenantId = requireTenantId(res); // throws 500 if middleware was skipped
  const rows = await getTenantTransactions({ tenantId });
  res.json(rows);
}
```

### Service — `tenantIsolationService`

**File:** `server/src/services/tenantIsolationService.ts`

Provides scoped query helpers that always include a `tenantId` predicate:

| Function                    | Description                                    |
|-----------------------------|------------------------------------------------|
| `getTenantTransactions`     | Paginated sponsored transactions for a tenant  |
| `getTenantApiKeys`          | All API keys belonging to a tenant             |
| `getTenantWebhookDeliveries`| Webhook delivery log for a tenant              |
| `getTenantDailySpend`       | Total fee spend since UTC midnight             |
| `getTenantById`             | Tenant record with subscription tier (throws if missing) |
| `getTenantQuotaTopUps`      | Quota purchase history for a tenant            |

## Isolation guarantee

Every helper hard-codes `where: { tenantId }` in its Prisma query.  Callers
cannot override this predicate — it is not derived from user input, only from
the authenticated `ApiKeyConfig`.

## Database indexes

The following existing indexes support efficient tenant-scoped queries:

```prisma
@@index([tenantId])   // Transaction, WebhookDelivery, WebhookDlq, QuotaTopUp
```
