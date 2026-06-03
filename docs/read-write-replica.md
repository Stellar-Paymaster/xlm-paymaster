# Read-Write Replica Separation for Analytics

## Overview

Analytical reads (spend forecasts, transaction history exports, audit log views)
are served from a dedicated read-only database replica.  This prevents heavy
`SELECT` scans from acquiring shared locks on the primary write database and
degrading fee-bump throughput.

## Architecture

```
Write path (fee bumps, API-key mutations, quota top-ups)
    └── prisma  (server/src/utils/db.ts)  →  primary DATABASE_URL

Read path (analytics, forecasts, dashboards)
    └── readPrisma  (server/src/utils/readDb.ts)  →  READ_REPLICA_URL
                                                      (falls back to DATABASE_URL)
```

## Configuration

| Environment variable | Description                                               |
|----------------------|-----------------------------------------------------------|
| `READ_REPLICA_URL`   | SQLite or PostgreSQL URL for the read-only replica        |
| `DATABASE_URL`       | Primary database URL (used as fallback when no replica)   |

When `READ_REPLICA_URL` is absent `readPrisma` connects to `DATABASE_URL`, so
local development and single-node deployments work without any extra setup.

## Usage

Import `readPrisma` instead of `prisma` for any handler that only reads data:

```typescript
import readPrisma from "../utils/readDb";

const transactions = await readPrisma.transaction.findMany({
  where: { status: "SUCCESS", createdAt: { gte: windowStart } },
  select: { costStroops: true, createdAt: true },
});
```

## Current read-replica consumers

| Handler / service          | File                                    |
|----------------------------|-----------------------------------------|
| `getSpendForecastHandler`  | `server/src/handlers/adminAnalytics.ts` |

Add further analytical handlers to this list as they are migrated.

## PostgreSQL replica setup (production)

For PostgreSQL, point `READ_REPLICA_URL` at a streaming-replication standby
configured with `hot_standby = on`.  The Prisma client will use the standby for
all `readPrisma` queries; write operations continue on the primary via the
existing `prisma` client.
