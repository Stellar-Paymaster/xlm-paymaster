-- ============================================================
-- Migration: Partition AuditLog table by month (RANGE)
-- Issue #711 – Architecture & Database: Partition Audit Logs Table
--
-- Strategy:
--   1. Build a partitioned replacement table
--   2. Create monthly child partitions (24 months back → 3 months ahead)
--   3. Add a DEFAULT partition for safety
--   4. Copy all existing rows
--   5. Recreate indexes on the parent (propagated to all partitions)
--   6. Swap old table → new partitioned table atomically
--
-- NOTE (production deployments): This migration copies all rows before
-- swapping. For tables with active write traffic, run during a maintenance
-- window or use a separate online-migration tool (pg_repack / pglogical).
-- ============================================================

-- Step 1: Create the partitioned parent table.
-- PRIMARY KEY must include the partition key ("createdAt") per PG rules.
CREATE TABLE "AuditLog_partitioned" (
  "id"        TEXT         NOT NULL,
  "actor"     TEXT         NOT NULL,
  "action"    TEXT,
  "target"    TEXT,
  "eventType" TEXT,
  "payload"   JSONB,
  "metadata"  TEXT,
  "aiSummary" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Step 2: Create one partition per calendar month.
--   Range: 24 months in the past → 3 months in the future.
DO $$
DECLARE
  d    DATE;
  name TEXT;
BEGIN
  d := DATE_TRUNC('month', NOW()) - INTERVAL '24 months';
  WHILE d <= DATE_TRUNC('month', NOW()) + INTERVAL '3 months' LOOP
    name := 'audit_log_y' || TO_CHAR(d, 'YYYY') || '_m' || TO_CHAR(d, 'MM');
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "AuditLog_partitioned"
         FOR VALUES FROM (%L::TIMESTAMP) TO (%L::TIMESTAMP)',
      name,
      d::TIMESTAMP,
      (d + INTERVAL '1 month')::TIMESTAMP
    );
    d := d + INTERVAL '1 month';
  END LOOP;
END;
$$;

-- Step 3: Default partition catches rows outside the explicit ranges.
CREATE TABLE "audit_log_default" PARTITION OF "AuditLog_partitioned" DEFAULT;

-- Step 4: Copy all existing data.
INSERT INTO "AuditLog_partitioned"
SELECT * FROM "AuditLog";

-- Step 5: Recreate indexes on the parent table.
CREATE INDEX "AuditLog_eventType_idx"
  ON "AuditLog_partitioned" ("eventType");

CREATE INDEX "AuditLog_actor_idx"
  ON "AuditLog_partitioned" ("actor");

CREATE INDEX "AuditLog_action_idx"
  ON "AuditLog_partitioned" ("action");

CREATE INDEX "AuditLog_timestamp_idx"
  ON "AuditLog_partitioned" ("timestamp");

CREATE INDEX "AuditLog_createdAt_idx"
  ON "AuditLog_partitioned" ("createdAt");

CREATE INDEX "AuditLog_actor_timestamp_idx"
  ON "AuditLog_partitioned" ("actor", "timestamp");

CREATE INDEX "AuditLog_action_timestamp_idx"
  ON "AuditLog_partitioned" ("action", "timestamp");

CREATE INDEX "AuditLog_eventType_timestamp_idx"
  ON "AuditLog_partitioned" ("eventType", "timestamp");

CREATE INDEX "AuditLog_target_timestamp_idx"
  ON "AuditLog_partitioned" ("target", "timestamp");

-- Step 6: Swap the tables atomically.
ALTER TABLE "AuditLog"             RENAME TO "AuditLog_old";
ALTER TABLE "AuditLog_partitioned" RENAME TO "AuditLog";

-- Step 7: Drop the original monolithic table.
DROP TABLE "AuditLog_old";
