# Congestion Simulator for Dynamic Fee Assertions (#731)

Simulates network congestion by driving `FeeManager` with configurable Horizon `fee_stats` responses and verifies Node/Rust fee-bump parity.

## Usage

```bash
cd server
npm run congestion:simulate
```

## How it works

1. Starts an in-process mock Horizon server with configurable `p70`/`p95` fee percentiles
2. Initializes `FeeManager` and calls `pollOnce()` for each congestion scenario
3. Computes fee-bump amounts via Node (`calculateFeeBumpFee`) and Rust formula mirror (`feeParity.ts`)
4. Reports PASS/FAIL for each scenario

## Scenarios

| Scenario | p70 | p95 | Expected multiplier |
|----------|-----|-----|---------------------|
| low-congestion | 90 | 120 | 1.0 |
| high-congestion | 300 | 800 | 2.0 |
| boundary-at-threshold | 400 | 400 | 2.0 |
| just-below-threshold | 399 | 399 | 1.0 |

Threshold: `max(p70, p95) / baseFee >= 4` → multiplier 2.0

## Unit tests

```bash
cd server
npm test -- feeParity
```

## Parity formula

Both stacks use: `ceil((operationCount + 1) * baseFee * multiplier)`

Node additionally applies: `max(calculated, innerFee + baseFee)` for high inner-fee transactions.
