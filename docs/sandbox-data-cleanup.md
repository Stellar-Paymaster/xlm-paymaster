# Sandbox Auto-Cleanup for Stale Test Data (#717)

**Issue:** #717  
**Package:** `server`

## Overview

A nightly worker purges stale transaction data generated in the sandbox environment and auto-resets sandbox API keys that have not been refreshed within the configured stale threshold.

## Implementation

| File | Purpose |
|------|---------|
| `server/src/services/sandboxCleanup.ts` | Core purge logic for sandbox tenant transactions |
| `server/src/handlers/sandbox.ts` | Manual reset endpoint + auto-reset helpers |
| `server/src/workers/sandboxCleanupWorker.ts` | Cron-driven nightly cleanup cycle |
| `server/src/workers/sandboxAutoReset.ts` | Legacy interval worker (superseded by cleanup worker) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SANDBOX_CLEANUP_ENABLED` | `true` | Master switch for the nightly worker |
| `SANDBOX_CLEANUP_CRON_SCHEDULE` | `0 4 * * *` | Cron schedule (04:00 daily) |
| `SANDBOX_DATA_RETENTION_DAYS` | `7` | Days to retain sandbox transaction data |
| `SANDBOX_CLEANUP_BATCH_SIZE` | `500` | Rows deleted per batch |
| `SANDBOX_RESET_STALE_HOURS` | `24` | Auto-reset keys older than this |
| `SANDBOX_HORIZON_URL` | `http://localhost:8000` | Friendbot funding endpoint |

## How It Works

1. **Identify sandbox tenants** — query `ApiKey` records where `isSandbox = true`.
2. **Purge stale data** — delete `Transaction`, `SponsoredTransaction`, and `WebhookDelivery` rows older than the retention cutoff for those tenants.
3. **Auto-reset keys** — rotate fee payer secrets and wipe all data for keys whose `sandboxLastResetAt` is null or older than `SANDBOX_RESET_STALE_HOURS`.
4. **Fund accounts** — call the Stellar Quickstart friendbot to fund the new fee payer public key.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/sandbox/reset` | Sandbox API key | Manual reset for the caller's tenant |
| `POST` | `/admin/sandbox/api-keys` | Admin token | Create a new sandbox key |

## Running Tests

```bash
cd server
pnpm exec vitest run src/services/sandboxCleanup.test.ts \
  src/handlers/sandbox.test.ts \
  src/workers/sandboxCleanupWorker.test.ts
```

## Edge Cases

- **No sandbox tenants**: Cleanup returns `SUCCESS` with zero deletions — no SQL writes.
- **Friendbot unavailable**: Reset completes but `funded: false` in the response; data is still purged.
- **Concurrent manual reset**: Each reset is scoped to a single tenant; batch cleanup skips in-progress manual resets naturally via timestamp ordering.
- **Database errors**: Report status is `FAILED`; the cron job continues on the next tick.
