# Implementation: #488 #489 #490 #491

## Scope
This delivery implements four issues in package-scoped areas:

- #488 Audit Trail Snapshots in `admin-dashboard`
- #489 Low Funds Critical Banner in `admin-dashboard`
- #490 Team Member Invitations with expiring links in `admin-dashboard`
- #491 Local Sandbox Docker Compose in `client`

## Technical Design

### #489 Low Funds Critical Banner
- Added deterministic critical-state evaluator in `admin-dashboard/lib/treasury-critical-banner.ts`
- Signals considered critical:
  - Main balance below threshold (default `1500 XLM`)
  - Runway under threshold (default `<= 3 days`)
  - Invalid telemetry values (NaN/negative/invalid spend)
- Dashboard now renders a persistent critical banner with action CTA to billing.

### #490 Team Member Invitations
- Added invitation primitives in `admin-dashboard/lib/team-invitations.ts`:
  - email normalization/validation
  - TTL clamping (`1..168` hours)
  - secure token generation and expiring invite URL generation
- Extended admin users table with:
  - Invite modal
  - pending invitation list
  - copy link action
  - duplicate pending invite protection

### #488 Audit Trail Snapshots
- Added metadata diff engine in `admin-dashboard/lib/audit-trail-snapshots.ts`
- Audit log UI now includes per-row `What changed` snapshots against previous log entry
- Handles invalid JSON and missing baseline safely

### #491 Local Sandbox Docker Compose
- Added local compose generator in `client/src/sandbox/localSandboxCompose.ts`
- Added materialized compose file `client/src/sandbox/docker-compose.local.yml`
- Added write script `client/src/sandbox/writeLocalSandboxCompose.ts`
- Added one-command scripts in `client/package.json`:
  - `sandbox:up`
  - `sandbox:down`
  - `sandbox:logs`
  - `sandbox:ps`

## Edge Cases Covered
- Invalid/negative treasury signals produce critical state
- Invitations reject malformed emails and duplicate pending recipients
- Invitation expiry detection covers malformed timestamps
- Audit snapshots degrade gracefully when metadata JSON is malformed
- Compose generation supports custom host ports for collisions

## Security Notes
- Invitation links are tokenized and time-bounded
- No secrets persisted in source other than local dev defaults for sandbox
- Fallback invitation creation is local-only and does not grant backend access by itself

## Performance Notes
- Snapshot diff compares only key-level metadata and avoids deep traversal
- Banner logic is constant-time and computed once per dashboard render
- Compose generation is static string composition with no runtime dependencies
