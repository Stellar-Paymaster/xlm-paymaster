-- Fix duplicate AuditLog: drop the old table and recreate with merged schema
-- (The old table had eventType/payload/timestamp; the new one adds action/target/metadata/aiSummary)
DROP TABLE IF EXISTS "AuditLog";

-- CreateTable: merged AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    "actor" TEXT NOT NULL,
    "eventType" TEXT,
    "payload" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT,
    "target" TEXT,
    "metadata" TEXT,
    "aiSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateTable: SpendBaseline for anomaly detection
CREATE TABLE "SpendBaseline" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    "tenantId" TEXT NOT NULL,
    "dailyAvgStroops" BIGINT NOT NULL DEFAULT 0,
    "hourlyAvgStroops" BIGINT NOT NULL DEFAULT 0,
    "totalTransactions" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpendBaseline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SpendBaseline_tenantId_key" ON "SpendBaseline"("tenantId");
CREATE INDEX "SpendBaseline_tenantId_idx" ON "SpendBaseline"("tenantId");

-- CreateTable: FlaggedEvent for anomaly detection
CREATE TABLE "FlaggedEvent" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    "tenantId" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "hourStart" DATETIME NOT NULL,
    "actualSpendStroops" BIGINT NOT NULL,
    "baselineDailyStroops" BIGINT NOT NULL,
    "multiplier" REAL NOT NULL,
    "riskScore" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" TEXT,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlaggedEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FlaggedEvent_tenantId_idx" ON "FlaggedEvent"("tenantId");
CREATE INDEX "FlaggedEvent_status_idx" ON "FlaggedEvent"("status");
CREATE INDEX "FlaggedEvent_riskScore_idx" ON "FlaggedEvent"("riskScore");
CREATE INDEX "FlaggedEvent_createdAt_idx" ON "FlaggedEvent"("createdAt");

-- CreateTable: SARReport for individual suspicious transaction flags
CREATE TABLE "SARReport" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    "transactionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SARReport_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SARReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SARReport_transactionId_ruleCode_key" ON "SARReport"("transactionId", "ruleCode");
CREATE INDEX "SARReport_tenantId_idx" ON "SARReport"("tenantId");
CREATE INDEX "SARReport_status_idx" ON "SARReport"("status");
CREATE INDEX "SARReport_ruleCode_idx" ON "SARReport"("ruleCode");
CREATE INDEX "SARReport_createdAt_idx" ON "SARReport"("createdAt");
