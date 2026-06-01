# Prisma Index Audit

The server package includes a schema audit for compound indexes required on the large `Transaction` and `AuditLog` tables.

## Command

```sh
npm run audit:prisma-indexes
```

The command reads `prisma/schema.prisma`, verifies the required index definitions, prints a JSON report, and exits non-zero if any required index is missing.

## Required Indexes

- `Transaction(tenantId, status, createdAt)` for tenant transaction history and quota reconciliation.
- `Transaction(status, createdAt)` for lifecycle scans and pending/failed transaction workflows.
- `Transaction(chain, createdAt)` for cross-chain analytics and settlement views.
- `AuditLog(actor, timestamp)` for actor timelines.
- `AuditLog(action, timestamp)` for admin activity exports.
- `AuditLog(eventType, timestamp)` for SOC2 and security reports.
- `AuditLog(target, timestamp)` for resource-level investigations.

Migration `20260423000000_prisma_index_audit` creates the matching database indexes.
