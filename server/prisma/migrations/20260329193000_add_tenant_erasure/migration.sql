-- Add tenant contact + soft-delete metadata
ALTER TABLE "Tenant" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "erasureRequestedAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "scheduledPurgeAt" DATETIME;

CREATE INDEX "Tenant_contactEmail_idx" ON "Tenant"("contactEmail");
CREATE INDEX "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");
CREATE INDEX "Tenant_scheduledPurgeAt_idx" ON "Tenant"("scheduledPurgeAt");

-- Rebuild Transaction so tenantId can be nulled during anonymisation.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "txHash" TEXT,
    "innerTxHash" TEXT NOT NULL,
    "tenantId" TEXT,
    "status" TEXT NOT NULL,
    "costStroops" BIGINT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "chain" TEXT NOT NULL DEFAULT 'stellar',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_Transaction" (
    "id",
    "txHash",
    "innerTxHash",
    "tenantId",
    "status",
    "costStroops",
    "category",
    "chain",
    "createdAt"
)
SELECT
    "id",
    "txHash",
    "innerTxHash",
    "tenantId",
    "status",
    "costStroops",
    COALESCE("category", 'Other'),
    'stellar',
    "createdAt"
FROM "Transaction";

DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";

CREATE INDEX "Transaction_tenantId_idx" ON "Transaction"("tenantId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_txHash_idx" ON "Transaction"("txHash");
CREATE INDEX "Transaction_category_idx" ON "Transaction"("category");
CREATE INDEX "Transaction_chain_idx" ON "Transaction"("chain");

PRAGMA foreign_keys=ON;
