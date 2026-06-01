CREATE TABLE "CrossChainSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_EVM_PAYMENT',
    "sourceChainId" INTEGER NOT NULL,
    "sourceTokenAddress" TEXT NOT NULL,
    "sourceAmount" TEXT NOT NULL,
    "payerAddress" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "startBlock" INTEGER NOT NULL,
    "confirmationsRequired" INTEGER NOT NULL DEFAULT 1,
    "xdr" TEXT NOT NULL,
    "submit" BOOLEAN NOT NULL DEFAULT false,
    "feePayerPublicKey" TEXT NOT NULL,
    "sourceTxHash" TEXT,
    "refundTxHash" TEXT,
    "errorMessage" TEXT,
    "confirmedAt" DATETIME,
    "settledAt" DATETIME,
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrossChainSettlement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrossChainSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CrossChainSettlement_transactionId_key" ON "CrossChainSettlement"("transactionId");
CREATE INDEX "CrossChainSettlement_status_idx" ON "CrossChainSettlement"("status");
CREATE INDEX "CrossChainSettlement_tenantId_idx" ON "CrossChainSettlement"("tenantId");
CREATE INDEX "CrossChainSettlement_sourceTxHash_idx" ON "CrossChainSettlement"("sourceTxHash");
