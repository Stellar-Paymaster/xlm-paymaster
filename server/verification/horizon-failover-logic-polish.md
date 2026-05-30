# Horizon Failover Logic Polish Verification

Timestamp: `2026-04-25T17:39:58Z`

## Changes Verified By Inspection

- Shared Horizon failover client is initialized during server startup and passed
  into `LedgerMonitor`.
- Retryable Horizon failures now degrade/inactivate a node with cooldown and
  retry metadata.
- Non-retryable submission failures no longer poison node health.
- Eligible degraded nodes are probed asynchronously for recovery while healthy
  nodes continue serving traffic.

## Terminal Output

### Targeted failover tests

```text
$ npm test -- --run src/horizon/failoverClient.test.ts src/workers/ledgerMonitor.failover.test.ts

> fluid-server-ts@0.1.1 test
> vitest --run src/horizon/failoverClient.test.ts src/workers/ledgerMonitor.failover.test.ts

sh: vitest: command not found
npm error Lifecycle script `test` failed with error:
npm error code 127
npm error path /Users/ik/Documents/fluid/server
npm error workspace fluid-server-ts@0.1.1
npm error location /Users/ik/Documents/fluid/server
npm error command failed
npm error command sh -c vitest --run src/horizon/failoverClient.test.ts src/workers/ledgerMonitor.failover.test.ts
```

### Local toolchain check

```text
$ ls node_modules/.bin/vitest
ls: node_modules/.bin/vitest: No such file or directory
```

### TypeScript project check

```text
$ pnpm exec tsc -p tsconfig.json --noEmit
src/services/alertService.ts(1,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(3,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(10,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(14,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(35,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(282,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(287,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(294,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(592,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(635,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(640,1): error TS1185: Merge conflict marker encountered.
src/services/alertService.ts(680,1): error TS1185: Merge conflict marker encountered.
src/test-alert.ts(126,8): error TS1005: '}' expected.
```

### Existing repo blockers confirmed

```text
$ rg -n "^(<<<<<<<|=======|>>>>>>>)" src/services/alertService.ts
1:<<<<<<< HEAD
3:=======
10:>>>>>>> upstream/main
14:<<<<<<< HEAD
35:=======
282:>>>>>>> upstream/main
287:<<<<<<< HEAD
294:=======
592:>>>>>>> upstream/main
635:<<<<<<< HEAD
640:=======
680:>>>>>>> upstream/main
```

```text
$ sed -n '120,130p' src/test-alert.ts
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
}

main();
```

## Verification Status

- Code changes applied in `server/src`.
- Documentation added in `server/docs`.
- Verification artifacts added in `server/verification`.
- Full automated execution is currently blocked by missing local test tooling and
  pre-existing repository syntax/merge-conflict errors outside this patch.
