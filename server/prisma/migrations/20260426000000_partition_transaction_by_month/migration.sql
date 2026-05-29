-- ============================================================
-- Migration: Partition Transaction table by month (RANGE)
-- Issue #237 – Performance: Partitioned Transaction Table
--
-- Strategy:
--   1. Build a partitioned replacement table
--   2. Create monthly child partitions (24 months back → 3 months ahead)
--   3. Add a DEFAULT partition for safety
--   4. Copy all existing rows
--   5. Recreate indexes on the parent (propagated to all partitions)
--   6. Drop FK constraints that cannot reference a partial unique key
--      (PostgreSQL requires the partition key in every UNIQUE constraint;
--       referential integrity is maintained at the Prisma / application layer)
--   7. Swap old table → new partitioned table atomically
--
-- NOTE (production deployments): This migration copies all rows before
-- swapping. For tables with active write traffic, run during a maintenance
-- window or use a separate online-migration tool (pg_repack / pglogical).
-- ============================================================

-- Step 1: Create the partitioned parent table.
-- PRIMARY KEY must include the partition key ("createdAt") per PG rules.
CREATE TABLE "Transaction_partitioned" (
  "id"           TEXT         NOT NULL,
  "txHash"       TEXT,
  "innerTxHash"  TEXT         NOT NULL,
  "tenantId"     TEXT,
  "status"       TEXT         NOT NULL,
  "costStroops"  BIGINT       NOT NULL,
  "category"     TEXT         NOT NULL DEFAULT 'Other',
  "chain"        TEXT         NOT NULL DEFAULT 'stellar',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Step 2: Create one partition per calendar month.
--   Range: 24 months in the past → 3 months in the future.
--   Each child table is named  transaction_y<YYYY>_m<MM>
DO $$
DECLARE
  d    DATE;
  name TEXT;
BEGIN
  d := DATE_TRUNC('month', NOW()) - INTERVAL '24 months';
  WHILE d <= DATE_TRUNC('month', NOW()) + INTERVAL '3 months' LOOP
    name := 'transaction_y' || TO_CHAR(d, 'YYYY') || '_m' || TO_CHAR(d, 'MM');
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "Transaction_partitioned"
         FOR VALUES FROM (%L::TIMESTAMP) TO (%L::TIMESTAMP)',
      name,
      d::TIMESTAMP,
      (d + INTERVAL '1 month')::TIMESTAMP
    );
    d := d + INTERVAL '1 month';
  END LOOP;
END;
$$;

-- Step 3: Default partition catches any rows outside the explicit ranges.
CREATE TABLE "transaction_default" PARTITION OF "Transaction_partitioned" DEFAULT;

-- Step 4: Copy all existing data.
INSERT INTO "Transaction_partitioned"
SELECT * FROM "Transaction";

-- Step 5: Recreate indexes on the parent table.
--   PostgreSQL 11+ automatically propagates parent indexes to every
--   existing and future child partition.
CREATE INDEX "Transaction_tenantId_idx"
  ON "Transaction_partitioned" ("tenantId");

CREATE INDEX "Transaction_status_idx"
  ON "Transaction_partitioned" ("status");

CREATE INDEX "Transaction_txHash_idx"
  ON "Transaction_partitioned" ("txHash");

CREATE INDEX "Transaction_category_idx"
  ON "Transaction_partitioned" ("category");

CREATE INDEX "Transaction_chain_idx"
  ON "Transaction_partitioned" ("chain");

CREATE INDEX "Transaction_tenantId_status_createdAt_idx"
  ON "Transaction_partitioned" ("tenantId", "status", "createdAt");

CREATE INDEX "Transaction_status_createdAt_idx"
  ON "Transaction_partitioned" ("status", "createdAt");

CREATE INDEX "Transaction_chain_createdAt_idx"
  ON "Transaction_partitioned" ("chain", "createdAt");

-- Step 6: Drop FK constraints that reference Transaction(id).
--   PostgreSQL requires all unique constraints on a partitioned table to
--   include the partition key.  A FK can only reference a unique constraint,
--   so a FK to just Transaction(id) is impossible once the table is
--   partitioned.  Referential integrity is maintained by Prisma at the
--   application layer (cascade deletes handled via Prisma relations).
ALTER TABLE "CrossChainSettlement"
  DROP CONSTRAINT IF EXISTS "CrossChainSettlement_transactionId_fkey";

ALTER TABLE "SARReport"
  DROP CONSTRAINT IF EXISTS "SARReport_transactionId_fkey";

-- Step 7: Swap the tables (both renames happen in a single DDL batch,
--   minimising the window during which neither name exists).
ALTER TABLE "Transaction"             RENAME TO "Transaction_old";
ALTER TABLE "Transaction_partitioned" RENAME TO "Transaction";

-- Step 8: Drop the original monolithic table.
DROP TABLE "Transaction_old";
