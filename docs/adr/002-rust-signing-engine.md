# ADR 002: Rust for the Signing Engine

## Status

Accepted

## Context

Fluid's core value proposition is low-latency, high-throughput fee-bump transaction signing. Every sponsored transaction passes through the signing engine synchronously before a response is returned to the caller. The original Node.js implementation (`server/`) was sufficient during early development, but profiling revealed two problems:

1. **Throughput ceiling** — the Node.js event loop serialises CPU-bound work (XDR serialisation, ed25519 signing, fee-bump wrapping). Under load spikes—common during NFT mints or DeFi events on Stellar—P99 latency climbed above 300 ms on commodity hardware.
2. **Memory unpredictability** — V8's garbage collector caused latency spikes of up to 50 ms at intervals, making it difficult to meet SLA commitments for Pro-tier tenants.

The team evaluated three alternative runtimes: Go, Rust, and C. Key evaluation criteria were:

- Predictable, sub-millisecond GC pauses (or no GC at all)
- First-class async I/O without a global interpreter lock
- Strong type system to eliminate entire classes of signing bugs at compile time
- Availability of production-quality Stellar XDR and ed25519 libraries

## Decision

We will rewrite the fee-bump signing engine in Rust using the Axum web framework and Tokio async runtime. The Rust binary (`fluid-server/`) becomes the primary production backend. The Node.js server (`server/`) is retained as a parity harness and migration aid while the rollout completes, but all new signing work targets the Rust implementation.

Specific libraries chosen:

| Concern | Crate |
|---------|-------|
| HTTP server | `axum 0.8` + `tokio` (full features) |
| Stellar XDR | `stellar-xdr 26.0.0` |
| Key derivation | `ed25519-dalek` |
| Database | `sqlx 0.7` (async, compile-time query checking) |
| gRPC service | `tonic 0.12` |

## Consequences

- **Pros**:
  - Zero-GC memory model eliminates latency spikes; P99 signing latency drops below 5 ms under sustained load.
  - Compile-time borrow checker prevents use-after-free and data-race bugs in the signing path.
  - `sqlx` compile-time query verification catches schema drift before deployment.
  - Single statically linked binary simplifies container images and cold-start times.
- **Cons**:
  - Rust has a steeper learning curve than Node.js; onboarding new contributors to `fluid-server/` takes longer.
  - Build times are significantly longer than for the Node.js server; Nx remote caching (`NX_CLOUD_AUTH_TOKEN`) is required to keep CI times acceptable.
  - Two signing implementations must be kept in parity during the migration window, increasing maintenance surface.
- **Neutral**:
  - The Rust binary exposes the same HTTP API surface as the Node.js server, so the TypeScript client and admin dashboard required no changes.
