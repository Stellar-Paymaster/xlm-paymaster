# Database Archiving and Pruning Policy

## Overview

Transactions older than a configurable retention window (default **90 days**) are
automatically moved from the hot `transaction` table into a warm
`archived_transaction` table and then deleted from the primary table.  A
node-cron job drives the process so no external scheduler is required.

## Implementation

| File | Purpose |
|------|---------|
| `server/src/services/databaseArchiver.ts` | Core `DatabaseArchiverService` class + `initDatabaseArchiver` lifecycle helper |
| `server/src/services/databaseArchiver.test.ts` | Vitest unit tests |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_ARCHIVE_ENABLED` | `false` | Set to `true` to activate the cron job |
| `DATABASE_ARCHIVE_CRON` | `0 2 * * *` | node-cron schedule (daily at 02:00) |
| `DATABASE_ARCHIVE_RETENTION_DAYS` | `90` | Days to keep in hot table |
| `DATABASE_ARCHIVE_BATCH_SIZE` | `500` | Rows moved per transaction batch |

## How It Works

1. **Cutoff calculation** — `now − retentionDays` determines the archival boundary.
2. **Warm archive table** — `archived_transaction` is auto-created on first run
   (mirrors `transaction` + an `archived_at` column).
3. **Batch loop** — the service fetches up to `batchSize` old IDs, copies the
   rows to `archived_transaction`, then deletes them from `transaction`.  Looping
   in small batches keeps individual transactions short and avoids write-lock
   contention.
4. **Report** — every run returns an `ArchiveRunReport` with counts, timing,
   and status for observability / alerting.

## Usage

```typescript
import { initDatabaseArchiver } from "./services/databaseArchiver";
import { prisma } from "./db/client";

initDatabaseArchiver({
  prisma,
  enabled: true,
  cronSchedule: "0 2 * * *",   // 2 am daily
  retentionDays: 90,
  batchSize: 500,
});
```

Or rely entirely on environment variables:

```bash
DATABASE_ARCHIVE_ENABLED=true
DATABASE_ARCHIVE_RETENTION_DAYS=90
DATABASE_ARCHIVE_CRON="0 2 * * *"
```

## Edge Cases

- If `archived_transaction` already exists the `CREATE TABLE IF NOT EXISTS`
  is a no-op; the `ALTER TABLE … ADD COLUMN` for `archived_at` is caught and
  silently ignored if the column is already present.
- An empty batch (no rows match the cutoff) exits the loop immediately — no
  SQL writes are issued.
- Any unhandled database error sets `status: "FAILED"` in the report and is
  logged; the cron job continues to run on future ticks.
