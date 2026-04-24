# Signer mTLS Enforcement

## Overview

This document describes the mutual TLS (mTLS) enforcement implementation between the Node.js API layer and the Rust `grpc_engine` signer binary introduced in issue [#449].

The Fluid platform uses an internal gRPC channel to forward signing requests from the Node.js API to a Rust process that holds key material. This channel is hardened with full mutual TLS so that neither side can be impersonated and every connection is cryptographically authenticated.

---

## Architecture

```
Node.js API (GrpcEngineSignerClient)
        │  mTLS over gRPC (h2 + TLS 1.3)
        ▼
Rust grpc_engine binary (InternalSignerService)
```

Both sides present X.509 certificates during the TLS handshake. The connection is rejected if either certificate cannot be verified.

---

## Server (`grpc_engine`)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FLUID_GRPC_ENGINE_LISTEN_ADDR` | No (default `127.0.0.1:50051`) | `host:port` to bind |
| `FLUID_GRPC_ENGINE_TLS_CERT_PATH` | **Yes** | PEM file with server certificate (leaf + issuing CA chain recommended) |
| `FLUID_GRPC_ENGINE_TLS_KEY_PATH` | **Yes** | PEM file with server private key |
| `FLUID_GRPC_ENGINE_TLS_CLIENT_CA_PATH` | **Yes** | PEM file of the CA(s) authorised to sign client certificates |
| `FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256` | No | Comma-separated SHA-256 fingerprints of accepted client certificates. When set, the server rejects any client cert not in this set even if it chains to the trusted CA. |

### Security Behaviours

1. **Mutual authentication** – `WebPkiClientVerifier` is configured so every incoming connection must present a valid client certificate signed by the configured CA. Connections that fail the TLS handshake are dropped and logged at `WARN`.

2. **Certificate pinning** – When `FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256` is non-empty the server additionally verifies that the presented client leaf certificate's SHA-256 DER fingerprint is in the pinned set. Mismatches are rejected and logged with the presented fingerprint.

3. **Zero-downtime cert rotation** – `ReloadingTlsConfig` compares the on-disk bytes of the cert, key, and CA files on every new connection. When a change is detected a new `ServerConfig` is built and cached atomically via an `Arc<RwLock<…>>`. The server process does not need to be restarted to pick up rotated certificates.

4. **ALPN** – The server advertises `h2` so gRPC clients negotiate HTTP/2 correctly.

5. **Fail-closed** – All error paths (TLS load failure, handshake failure, fingerprint mismatch) drop the connection without forwarding it to tonic, ensuring no unauthenticated request can reach the signing service.

### Fingerprint Format

Fingerprints may be supplied with or without the `sha256:` prefix and with or without colons between hex bytes. All of the following are equivalent:

```
sha256:ab:cd:ef:...
sha256:abcdef...
abcdef...
```

---

## Client (`GrpcEngineSignerClient`)

The TypeScript client is configured via `GrpcEngineConfig`:

```typescript
new GrpcEngineSignerClient({
  address: "127.0.0.1:50051",
  serverName: "fluid-grpc-engine.internal",   // SNI / hostname check
  tlsCaPath: "/etc/fluid/ca.pem",             // CA that signed the server cert
  tlsCertPath: "/etc/fluid/client.pem",       // Client certificate
  tlsKeyPath: "/etc/fluid/client-key.pem",    // Client private key
  pinnedServerCertSha256: ["abcdef..."],       // Optional server cert pins
})
```

### Security Behaviours

1. **Mutual authentication** – `grpc.credentials.createSsl` is called with the client key/cert pair so the Node.js side presents its certificate during every handshake.

2. **Server certificate pinning** – `checkServerIdentity` is overridden to perform a standard hostname check and then verify that the server leaf certificate's SHA-256 fingerprint is in `pinnedServerCertSha256`. If the pin list is empty, only the hostname check applies.

3. **Live cert rotation** – `getClient()` reads cert files from disk on every call and invalidates the cached gRPC channel when the bytes change, so a rotated client certificate is picked up without restarting the API process.

4. **Failover** – A secondary signer address may be configured. The client uses a 30-second circuit breaker: if the primary fails it routes requests to the secondary and retries the primary after the cooldown.

---

## Key Rotation Procedure

1. Generate new server cert signed by the same CA (or a new CA whose cert is appended to `TLS_CLIENT_CA_PATH`).
2. Write the new cert and key to disk at the paths configured in the environment.
3. Add the new server cert fingerprint to `pinnedServerCertSha256` on the Node.js side **before** deploying.
4. The Rust engine will detect the file change on the next incoming connection and switch to the new cert automatically.
5. Once all clients have rotated, remove the old fingerprint from the pin list.

Client certificate rotation follows the same pattern using `FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256`.

---

## Test Coverage

Integration tests live in `src/signing/grpcEngine.test.ts` and cover:

| Scenario | Expected outcome |
|---|---|
| Valid mTLS with pinned certs | Request succeeds, signature verifiable |
| Client cert signed by rogue CA | Server rejects at TLS handshake |
| Server cert fingerprint mismatch | Client rejects with `Pinned server certificate mismatch` |
| Cert rotation (server + client) | Requests succeed before and after rotation; server logs `reloaded gRPC engine TLS material` |

Run with:
```sh
pnpm run test:grpc-mtls
```

---

## References

- [`src/bin/grpc_engine.rs`](../src/bin/grpc_engine.rs) – Rust signer server
- [`src/signing/grpcEngineClient.ts`](../src/signing/grpcEngineClient.ts) – TypeScript client
- [`src/signing/grpcEngine.test.ts`](../src/signing/grpcEngine.test.ts) – Integration tests
- [rustls `WebPkiClientVerifier`](https://docs.rs/rustls/latest/rustls/server/struct.WebPkiClientVerifier.html)
- [grpc-js `createSsl`](https://grpc.github.io/grpc/node/grpc.credentials.html#.createSsl)
