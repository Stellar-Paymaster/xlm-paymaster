# UI Dashboard Enhancements

This release bundles the admin-dashboard work for issues #746, #753, #754, and #755 into a single, reusable set of UI updates.

## What Changed

- Added a signer balance ring chart that summarizes active signer funds as a share of the active pool.
- Added a Horizon latency grid that probes active Horizon endpoints and surfaces ping latency plus sync state.
- Added a reusable React error boundary screen with a retry action and expandable error details.
- Replaced the old i18n wrapper with a `next-intl` provider, locale persistence, and a language switcher in the navbar.

## Validation

- `pnpm exec vitest run components/signers/SignerBalanceRingChart.test.tsx`
- `node --test --experimental-test-isolation=none --experimental-strip-types lib/horizon-monitor.test.ts`

## Visual Checks

- Signer management page screenshot captured with the ring chart visible.
- Chains page screenshot captured with the Horizon latency grid visible.
