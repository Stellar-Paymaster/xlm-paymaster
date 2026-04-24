## Title
feat: server hardening reliability hooks

## Summary

- Adds Prisma index audit logic and required compound indexes for large `Transaction` and `AuditLog` tables.
- Adds critical treasury rebalancer failure alerting through `AlertService`, Slack, and persisted admin notifications.
- Adds a disabled-by-default third-party KYC hook before fee sponsorship.
- Adds environment-tuned ledger monitor concurrency controls.

## Verification

Not run per request. Added focused unit coverage for Prisma index audit, KYC decisions, treasury rebalancer alerting, and ledger monitor concurrency.

## Issues

Closes #453
Closes #462
Closes #447
Closes #465
