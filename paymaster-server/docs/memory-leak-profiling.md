# Memory Leak Profiling under 24-Hour Load

**Issue:** #737  
**Package:** `paymaster-server`

## Overview

Profiles the Rust server's XDR parsing paths under sustained load to verify that memory usage remains constant (no unbounded growth that would indicate a leak).

## Approach

Rather than running a literal 24-hour Valgrind session in CI, the test suite uses the existing `TrackingAllocator` in `profiling.rs` to measure net allocations across two equal-sized windows.  A true leak causes the second window to produce significantly more net allocations than the first.

## Test File

`paymaster-server/src/memory_leak_profiling.rs`

## Tests

| Test | What it checks |
|---|---|
| `parse_xdr_net_allocations_do_not_grow_between_windows` | Net allocs stable across two 500-iteration windows |
| `parse_xdr_zero_copy_net_allocations_do_not_grow_between_windows` | Same for zero-copy path |
| `bytes_per_parse_xdr_iteration_within_ceiling` | ≤ 64 KiB allocated per parse call on average |
| `bytes_per_parse_xdr_zero_copy_iteration_within_ceiling` | Same for zero-copy path |
| `rejected_oversized_payloads_do_not_leak` | Rejection path does not accumulate memory |

## Running Tests

```bash
cd paymaster-server
cargo test memory_leak -- --nocapture
```

## For Full 24-Hour Profiling (optional)

Use DHAT or Valgrind Massif against the running server binary:

```bash
# DHAT (recommended – lower overhead)
cargo build --release
valgrind --tool=dhat ./target/release/paymaster-server

# Massif
valgrind --tool=massif --pages-as-heap=yes ./target/release/paymaster-server
ms_print massif.out.<pid> | head -60
```

Point a load generator (e.g. `k6 run k6/fee_bump_stress.js`) at the server for the desired duration and inspect the heap snapshot at the end.
