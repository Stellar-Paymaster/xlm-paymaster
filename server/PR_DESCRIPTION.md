## Title
feat: horizon-failover-logic-polish

## Summary

- Hardens `HorizonFailoverClient` with explicit `Active` / `Degraded` /
  `Inactive` states, cooldown-based suppression, and recovery probes.
- Prevents non-retryable Horizon submission errors from poisoning node health.
- Initializes a shared Horizon failover client during server startup and passes
  it into `LedgerMonitor` so worker paths observe the same node state.
- Adds targeted unit and worker-level failover coverage plus docs and
  verification artifacts.

## Verification

- Added `src/horizon/failoverClient.test.ts`
- Added `src/workers/ledgerMonitor.failover.test.ts`
- Added [`verification/horizon-failover-logic-polish.md`](verification/horizon-failover-logic-polish.md)
- Execution is currently blocked by missing local `vitest` binaries and
  pre-existing parse errors in `src/services/alertService.ts` and
  `src/test-alert.ts`

## Issues

Closes #461
Refs #469
Refs #451
Refs #466
