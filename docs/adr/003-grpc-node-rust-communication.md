# ADR 003: gRPC for Internal Node-to-Rust Communication

## Status

Accepted

## Context

During the migration from Node.js to Rust, both servers run concurrently. The Node.js API server (`server/`) still handles administrative routes (tenant management, billing, OFAC screening, audit logs) while the Rust engine (`fluid-server/`) owns the performance-critical signing path. Some Node.js handlers need to delegate signing work to the Rust engine to avoid duplicating the signing logic.

Three inter-process communication options were considered:

| Option | Pros | Cons |
|--------|------|------|
| Plain HTTP (REST) | Simple, firewall-friendly | No streaming, high per-request overhead, no schema enforcement |
| Message queue (Redis Streams / BullMQ) | Decoupled, durable | Adds latency; not suitable for synchronous request-response signing |
| gRPC (Protocol Buffers) | Strongly typed, bi-directional streaming, low overhead | Requires proto file maintenance; more complex initial setup |

The signing operation is inherently synchronous from the caller's perspective: the client waits for a fee-bump XDR before it can proceed. A message queue would force async polling, complicating the client SDK. Plain HTTP lacked the schema enforcement and binary framing efficiency required at target throughput levels.

Security is a first-order requirement: the channel between Node.js and the Rust engine crosses a container-network boundary in production and must be authenticated on both ends to prevent a compromised sidecar from injecting unsigned transactions.

## Decision

We will use gRPC with Protocol Buffers over a mutual-TLS (mTLS) channel for all communication between the Node.js API server and the Rust signing engine.

- Proto definitions live in `/proto/` and are the single source of truth for the RPC contract.
- Both sides present certificates signed by a private internal CA (`server/certs/`).
- Certificate fingerprints are pinned via `FLUID_GRPC_ENGINE_PINNED_SERVER_CERT_SHA256` and `FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256` environment variables to prevent MITM attacks even if the CA is compromised.
- The Rust engine listens on `FLUID_GRPC_ENGINE_LISTEN_ADDR` (default `127.0.0.1:50051`).
- The Node.js side uses the `@grpc/grpc-js` client configured via `FLUID_GRPC_ENGINE_*` environment variables.

See [`docs/grpc-mtls.md`](../grpc-mtls.md) for the full certificate provisioning guide.

## Consequences

- **Pros**:
  - The `.proto` schema is the canonical contract; breaking changes are caught at code-generation time rather than at runtime.
  - mTLS ensures mutual authentication; no additional application-layer auth token is needed on the internal channel.
  - gRPC binary framing is significantly more compact than JSON over HTTP for high-frequency signing calls.
  - Supports server-streaming RPCs for future use cases (e.g., streaming ledger events from Rust to Node.js).
- **Cons**:
  - Certificate rotation requires coordinated deployment; the pinned-fingerprint mechanism supports rotation by allowing two fingerprints simultaneously.
  - Proto file changes must be compiled for both the Rust (`tonic-build`) and Node.js (`grpc-tools`) sides, adding a build step.
  - gRPC is not directly callable from a browser; the admin dashboard communicates with the Node.js REST API, not the Rust gRPC service.
- **Neutral**:
  - Local development uses pre-generated development certificates in `server/certs/dev/`; production operators must provision their own CA.
