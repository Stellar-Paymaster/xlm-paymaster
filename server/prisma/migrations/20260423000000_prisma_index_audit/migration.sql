-- Compound indexes required by the Prisma index audit for large tables.
CREATE INDEX "Transaction_tenantId_status_createdAt_idx" ON "Transaction"("tenantId", "status", "createdAt");
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");
CREATE INDEX "Transaction_chain_createdAt_idx" ON "Transaction"("chain", "createdAt");

CREATE INDEX "AuditLog_actor_timestamp_idx" ON "AuditLog"("actor", "timestamp");
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");
CREATE INDEX "AuditLog_eventType_timestamp_idx" ON "AuditLog"("eventType", "timestamp");
CREATE INDEX "AuditLog_target_timestamp_idx" ON "AuditLog"("target", "timestamp");
