-- AlterTable: Tenant
ALTER TABLE "Tenant" ADD COLUMN "tosAcceptedAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "tosAcceptedIp" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "tosVersion" TEXT;

-- AlterTable: PendingRegistration
ALTER TABLE "PendingRegistration" ADD COLUMN "tosAcceptedAt" DATETIME;
ALTER TABLE "PendingRegistration" ADD COLUMN "tosAcceptedIp" TEXT;
ALTER TABLE "PendingRegistration" ADD COLUMN "tosVersion" TEXT;

-- CreateTable: TermsAcceptanceAudit
CREATE TABLE "TermsAcceptanceAudit" (
    "id"          TEXT     NOT NULL,
    "email"       TEXT     NOT NULL,
    "projectName" TEXT     NOT NULL,
    "tosVersion"  TEXT     NOT NULL,
    "acceptedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedIp"  TEXT     NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermsAcceptanceAudit_email_idx" ON "TermsAcceptanceAudit"("email");

-- CreateIndex
CREATE INDEX "TermsAcceptanceAudit_tosVersion_idx" ON "TermsAcceptanceAudit"("tosVersion");

-- CreateIndex
CREATE INDEX "TermsAcceptanceAudit_acceptedAt_idx" ON "TermsAcceptanceAudit"("acceptedAt");
