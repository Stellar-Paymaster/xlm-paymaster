-- Add data residency region field to Tenant
-- Default "US" preserves existing rows without data loss.
ALTER TABLE "Tenant" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'US';

-- Index supports per-region administrative queries (e.g. list all EU tenants)
CREATE INDEX "Tenant_region_idx" ON "Tenant"("region");
