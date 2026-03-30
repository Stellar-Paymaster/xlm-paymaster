# Issue 217: Turborepo Monorepo Optimisation

Date: 2026-03-30

Issue: https://github.com/Stellar-Fluid/fluid/issues/217

## Scope

- Added a root `turbo.json` task graph for `build`, `lint`, `test`, `docs`, `format:check`, and `dev`.
- Converted the JS/TS packages to root-managed npm workspaces.
- Wired Turbo remote-cache environment variables into CI and documented them in `.env.example`.
- Fixed build/test blockers uncovered while running the workflows locally.
- Captured before/after build timings and cache-hit proof.

## Timing Method

All timings below were captured locally from the repo root on March 30, 2026.

### Baseline: Sequential Per-Package Build

Command:

```bash
/usr/bin/time -p bash -lc 'npm run build --workspace server && npm run build --workspace client && npm run build --workspace admin-dashboard && npm run build --workspace frontend'
```

Result:

- `real 101.82`

### Turbo: Cold Build

Command:

```bash
/usr/bin/time -p npm run build -- --force
```

Result:

- `real 97.60`
- `Cached: 0 cached, 4 total`

### Turbo: Warm Build

Command:

```bash
/usr/bin/time -p npm run build
```

Result:

- `real 5.26`
- `Cached: 4 cached, 4 total`
- `Time: 4.702s >>> FULL TURBO`

## Timing Summary

| Scenario | Wall Clock |
| --- | --- |
| Sequential baseline | `101.82s` |
| Turbo cold | `97.60s` |
| Turbo warm | `5.26s` |

Observed improvement:

- Cold Turbo vs sequential: about `4.22s` faster (`~4.1%`).
- Warm Turbo vs sequential: about `96.56s` faster (`~94.8%`).

## Cache Proof

Warm build proof excerpt:

```text
Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
Time:    4.702s >>> FULL TURBO
```

Notes:

- The warm-cache verification required excluding generated `docs/**`, `.turbo/**`, and other build artifacts from Turbo task inputs.
- The Node server native module output was moved from the tracked repo root binary path to `server/build/native/fluid_signer.node` so generated binaries no longer poison task hashes.

## Remote Cache Configuration

Remote caching is configured but was not enabled during local timing runs because `TURBO_TEAM` and `TURBO_TOKEN` were unset locally.

CI wiring added:

- `TURBO_TEAM` from GitHub Actions repository/environment vars.
- `TURBO_TOKEN` from GitHub Actions secrets.

Local/CI env documentation added to:

- `.env.example`

## Workflow Verification

### JS/TS Workspace CI

Validated locally:

```bash
npm run build
npm run lint
npm run format:check
npm run test
npm run docs
```

Status:

- Passed

### Rust CI (`.github/workflows/rust-ci.yml`)

Validated locally with the exact workflow command:

```bash
cd fluid-server
cargo check --all-targets --all-features && cargo fmt --all -- --check && cargo clippy --all-targets --all-features -- -A dead_code && cargo test --all-targets --all-features
```

Status:

- Passed

### Fluid Server Verification (`.github/workflows/fluid-server-tests.yml`)

Validated locally with the exact workflow commands:

```bash
cd fluid-server
cargo test rust_server_handles_static_and_api_without_node --test rust_only_verification -- --nocapture
cargo test retries_failed_submission_on_secondary_node_and_logs_statuses -- --nocapture
cargo test does_not_retry_final_submission_errors -- --nocapture
```

Status:

- Passed

### Rust WASM (`.github/workflows/rust-wasm.yml`)

Validated locally in workflow order:

```bash
cargo test --manifest-path fluid-server/Cargo.toml --lib
cd fluid-server
wasm-pack build --release --target web --out-dir pkg/web
wasm-pack build --release --target nodejs --out-dir pkg/node
cd wasm-demo
npm ci
npm run test:node
npm run test:browser
```

Status:

- Passed

Local environment note:

- `npx playwright install --with-deps chromium` could not complete locally because it requires `sudo` to install OS packages.
- A user-level `npx playwright install chromium` was sufficient to complete the browser validation locally.
- The workflow file itself was left intact because GitHub Actions runners can satisfy the original `--with-deps` step.

## Functional Fixes Uncovered During Validation

- Fixed a duplicate dependency entry in `fluid-server/Cargo.toml`.
- Excluded `server/` from the root Cargo workspace to avoid mixed Rust/Node workspace conflicts.
- Fixed Rust server compilation issues in `server/rust/src/lib.rs` and `fluid-server/src/main.rs`.
- Fixed `admin-dashboard` build issues:
  - missing webhook delivery types
  - `StatusBadge` typing coverage
  - `CopyButton` prop mismatch
  - Next.js `useSearchParams()` suspense boundary requirement
- Fixed the WASM signing panic by keeping request-guard state native-only in `fluid-server/src/lib.rs`.
- Moved the Node native signer output into `server/build/native/` and updated the loader path.

