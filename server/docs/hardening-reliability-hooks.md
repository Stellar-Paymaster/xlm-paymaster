# Hardening and Reliability Hooks

## Treasury Rebalancer Alerts

`TreasuryRebalancer` now emits critical alerts when a hot wallet is below the rebalance threshold and top-up cannot complete. Alerts are sent through `AlertService`, persisted as admin notifications, and can be routed to Slack when `SLACK_ALERT_TREASURY_REBALANCE_FAILURE_ENABLED=true`.

Failure cases include:

- Wormhole bridge configuration missing while the hot wallet is below threshold.
- EVM treasury surplus below `WORMHOLE_MIN_EVM_SURPLUS_USDC`.
- Bridge initiation errors.
- Bridge tracking or redemption failures after initiation.

## KYC Sponsorship Hook

Fee sponsorship has an optional third-party KYC hook. It is disabled by default.

```env
FLUID_KYC_ENABLED=false
FLUID_KYC_ENDPOINT_URL=
FLUID_KYC_API_KEY=
FLUID_KYC_TIMEOUT_MS=2000
FLUID_KYC_FAIL_CLOSED=true
```

When enabled, the server sends a `POST` request with tenant, chain, request, and transaction fingerprint context before fee sponsorship. Provider responses with `status: "approved"` or `approved: true` allow sponsorship. Responses with `denied`, `blocked`, `review`, `pending`, malformed responses, or provider errors block sponsorship when `FLUID_KYC_FAIL_CLOSED=true`.

## Ledger Monitor Concurrency

Ledger monitor batch concurrency is configurable through:

```env
FLUID_LEDGER_MONITOR_CONCURRENCY=5
```

`LEDGER_MONITOR_THREADS` is accepted as a backward-compatible alias. Values are clamped to `1..64`.
