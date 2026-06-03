# Settings Panel Configuration Form

Admin interface at `/admin/settings` for hot-reloading runtime variables without a server restart.

## Fields

| Field | Default | Constraint | Description |
|-------|---------|------------|-------------|
| `base_fee` | 100 | ≥ 0 stroops | Minimum fee per sponsored transaction |
| `fee_multiplier` | 2 | ≥ 1 | Dynamic scaling factor during congestion |
| `low_balance_threshold` | 1000 | ≥ 0 stroops | Treasury alert trigger level |
| `rate_limit_per_minute` | 60 | ≥ 1 req/min | Per-key request throttle |
| `max_wallets_per_tenant` | 10 | ≥ 1 | Maximum registered wallets per tenant |
| `max_tx_per_hour` | 500 | ≥ 1 tx/hr | Hourly transaction cap per tenant |

## Behaviour

1. On page load, the form fetches current values from `GET /api/admin/settings`. If the endpoint is unavailable, defaults are used and an amber notice is shown.
2. On submit, values are validated client-side (Zod) then `POST`-ed to `/api/admin/settings`. A success toast confirms hot-reload.
3. "Reset to defaults" restores factory values in the form without saving; the user must explicitly save.
4. The save button is disabled when the form is pristine (no unsaved changes).

## Schema and utilities

`lib/settings-config.ts` exports:

- `SettingsConfig` — TypeScript interface
- `DEFAULT_SETTINGS` — factory defaults
- `SETTINGS_FIELDS` — metadata for each field (label, description, min, step, unit)
- `validateSettings(data)` — runtime type guard
- `mergeWithDefaults(partial)` — safe partial merge

## Tests

Unit tests (node:test):
```
node --test --experimental-strip-types lib/settings-config.test.ts
```
