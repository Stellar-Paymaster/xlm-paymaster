# Horizon Failover Logic Polish

## Scope

This change hardens the existing Horizon failover client used by server-side
workers so degraded Horizon nodes are detected faster, sidelined more safely,
and recovered without waiting for every healthy node to fail first.

## Technical Design

### Shared failover client

- `src/index.ts` now initializes a shared `HorizonFailoverClient` during server
  startup whenever `STELLAR_HORIZON_URLS` are configured.
- `LedgerMonitor` accepts that shared client so Horizon node state is observed
  consistently across worker activity.
- `TreasurySweeper` continues to read the shared client via
  `getHorizonFailoverClient()`, which now becomes available during startup.

### Node state model

`src/horizon/failoverClient.ts` now tracks three states:

- `Active`: the node is currently healthy.
- `Degraded`: the node hit a retryable failure and is in short cooldown.
- `Inactive`: the node exceeded the failure threshold and is on extended
  cooldown.

Each node now exposes:

- `lastFailureAt`
- `lastProbeAt`
- `retryAt`
- `lastResponseTimeMs`

These fields make `/health` and internal diagnostics more actionable during
incident response.

### Failure handling changes

- Retryable Horizon failures (`408`, `429`, `5xx`, socket/connect/timeout
  classes) immediately move the node out of the primary path.
- Cooldown duration is exponential and capped, so repeated failures are
  suppressed more aggressively without permanently blackholing a node.
- Non-retryable `4xx` submission failures no longer mark a Horizon node as bad.
  This avoids poisoning node health because of malformed or invalid client
  transactions.
- `404` account lookups still surface directly to callers and do not degrade the
  node.

### Recovery probing

- When at least one healthy node exists, the client asynchronously probes one
  eligible degraded/inactive node with `serverInfo()`.
- Successful probes reactivate the node without waiting for all healthy nodes to
  fail first.
- If no healthy node exists, the request path itself becomes the recovery
  attempt to avoid redundant concurrent probes.

## Edge Cases Covered

- Healthy node should not be sidelined because of a caller-side `400`.
- Failed primary should fall through to secondary on retryable submission
  errors.
- Previously degraded node should recover after cooldown via a light probe.
- Single-node operation should still attempt recovery directly when no active
  nodes remain.

## Tests Added

- `src/horizon/failoverClient.test.ts`
- `src/workers/ledgerMonitor.failover.test.ts`

These cover both the failover state machine and worker-level consumption of the
real failover client.
