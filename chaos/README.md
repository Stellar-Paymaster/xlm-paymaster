# Chaos Engineering — Fluid Fault Injection

This directory contains chaos experiment definitions and helper scripts for
validating Fluid's resilience under partial failure conditions (issue #241).

## Experiments

| File | Scenario | Tool |
|------|----------|------|
| `experiments/kill-rust-engine.yaml` | Kill the Rust signing engine mid-request | process kill / `pkill` |
| `experiments/postgres-connection-failure.yaml` | Inject Postgres TCP connection failure | Toxiproxy |
| `experiments/horizon-503.yaml` | Simulate Horizon returning 503 | Toxiproxy |

## Unit Tests (no external dependencies)

The in-process Vitest suite at `server/src/chaos/faultInjection.test.ts` covers
all three scenarios using mocks, providing a CI-safe proof of behaviour without
requiring Toxiproxy or a live Stellar network:

```bash
cd server
npx vitest run src/chaos/faultInjection.test.ts
```

## Live Experiments (staging only)

Live experiments require:
- [Toxiproxy](https://github.com/Shopify/toxiproxy) — `brew install toxiproxy`
- `toxiproxy-server` running on `localhost:8474`
- A running Fluid stack (docker-compose or equivalent)

```bash
# Start the Toxiproxy server
toxiproxy-server &

# Run a single experiment
TOXIPROXY_HORIZON_PORT=8001 \
API_URL=http://localhost:3001 \
chaos-toolkit run chaos/experiments/horizon-503.yaml
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/assert-fast-failure.mjs` | Assert the API fails fast (< N ms) |
| `scripts/assert-db-failure-handled.mjs` | Assert no hang under DB failure |
| `scripts/assert-horizon-fallback.mjs` | Assert structured response + CB state logged |
| `scripts/assert-recovery.mjs` | Poll until service returns expected status |
| `scripts/send-fee-bump-requests.mjs` | Fire N concurrent fee-bump requests |

## Recovery Time Results

| Scenario | Recovery path | Time |
|----------|---------------|------|
| Rust engine killed | gRPC error → 503 returned to caller | < 5 s (gRPC deadline) |
| Postgres connection failure | Connection pool retry / 503 | < 3 s (Prisma connection timeout) |
| Horizon primary 503 | Failover to secondary node | Instant (0 ms) |
| Horizon all nodes down | Circuit breaker open → fast-fail | < 1 ms (no I/O) |
| Horizon recovery | Half-open probe after 10 s cooldown | 10–15 s |

All results are documented by the test output.  Run the Vitest suite and
observe the `[chaos-recovery]` log lines for timing measurements.
