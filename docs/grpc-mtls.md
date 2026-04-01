# Internal gRPC mTLS and Certificate Pinning

This repository supports a pinned mutual-TLS gRPC channel between the Node API in `server/` and the Rust signer engine started with:

```bash
cd server
npm run grpc-engine

On Windows, building `grpc_engine` requires the Rust MSVC toolchain plus the Microsoft C++ Build Tools / Windows SDK so Cargo can link the Rust binary.
```

## Local Development with mkcert

Use a dedicated local CA and issue one certificate for the Node API and one for the Rust engine.

1. Install mkcert and create a local CA:

```bash
mkcert -install
```

2. Create a Rust engine server certificate with the internal DNS name used by gRPC:

```bash
mkcert -cert-file server/certs/dev/rust-engine.pem -key-file server/certs/dev/rust-engine-key.pem fluid-grpc-engine.internal 127.0.0.1 ::1
```

3. Create a Node API client certificate:

```bash
mkcert -client -cert-file server/certs/dev/node-api.pem -key-file server/certs/dev/node-api-key.pem fluid-node-api.internal
```

4. Export or copy the mkcert root CA PEM to `server/certs/dev/rootCA.pem`.

5. Set the following environment variables:

```bash
FLUID_GRPC_ENGINE_ADDRESS=127.0.0.1:50051
FLUID_GRPC_ENGINE_TLS_SERVER_NAME=fluid-grpc-engine.internal
FLUID_GRPC_ENGINE_CLIENT_CA_PATH=server/certs/dev/rootCA.pem
FLUID_GRPC_ENGINE_CLIENT_CERT_PATH=server/certs/dev/node-api.pem
FLUID_GRPC_ENGINE_CLIENT_KEY_PATH=server/certs/dev/node-api-key.pem
FLUID_GRPC_ENGINE_PINNED_SERVER_CERT_SHA256=<server-cert-sha256>

FLUID_GRPC_ENGINE_LISTEN_ADDR=127.0.0.1:50051
FLUID_GRPC_ENGINE_TLS_CERT_PATH=server/certs/dev/rust-engine.pem
FLUID_GRPC_ENGINE_TLS_KEY_PATH=server/certs/dev/rust-engine-key.pem
FLUID_GRPC_ENGINE_TLS_CLIENT_CA_PATH=server/certs/dev/rootCA.pem
FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256=<node-client-cert-sha256>
```

Compute a certificate fingerprint with OpenSSL if available:

```bash
openssl x509 -in server/certs/dev/rust-engine.pem -noout -fingerprint -sha256
```

## Rotation Without Downtime

The implementation is designed so new connections can pick up rotated certificates without restarting the Node API process.

1. Issue replacement Node API and Rust engine certificates before the current certificates expire.
2. Add both old and new SHA-256 fingerprints to:
   `FLUID_GRPC_ENGINE_PINNED_SERVER_CERT_SHA256`
   `FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256`
3. Ensure both sides trust an overlapping CA bundle.
   If rotating the CA, publish a bundle containing both the current and next CA certificates.
4. Replace the PEM files on disk.
   The Node API reloads its gRPC client TLS material automatically when the client cert, key, or CA bundle changes.
   The Rust engine reloads its server certificate, private key, and client CA bundle for new incoming TLS handshakes.
5. Remove the old fingerprint only after every connection has re-established with the new certificate and old pods are drained.

## Kubernetes / cert-manager

Recommended production pattern:

1. Issue short-lived internal certificates with `cert-manager` or Vault PKI.
2. Mount the Node API and Rust engine certificates as Kubernetes secrets.
3. Mount a shared CA bundle secret to both workloads.
4. During rotation, publish an overlapping CA bundle and overlapping pin set so old and new certificates are both valid.
5. Roll the Rust engine pods and Node API pods with normal Kubernetes readiness checks.
   Existing traffic stays available because new pods accept the new certificates before old pods are drained.

Example cert-manager approach:

- A dedicated internal `Issuer` or `ClusterIssuer` signs both the Rust engine server cert and the Node API client cert.
- The Rust engine service DNS name (for example `fluid-rust-engine.default.svc.cluster.local`) is included in the server certificate SANs.
- The Node API uses that DNS name as `FLUID_GRPC_ENGINE_TLS_SERVER_NAME`.

## Vault PKI

Recommended Vault PKI approach:

1. Create a dedicated PKI role for the Rust engine server certificate.
2. Create a separate PKI role for the Node API client certificate.
3. Issue short TTL certs and renew them before expiry.
4. Keep an overlapping root/intermediate bundle mounted to both services during CA rotation.
5. Keep both old and new leaf fingerprints configured until every connection has switched to the new certificates.

## Proof / Test Command

Run the end-to-end mTLS verification test from `server/`:

```bash
npm run test:grpc-mtls
```

That test:

- proves successful mTLS signing over the Node-to-Rust gRPC channel
- proves the Rust engine rejects an untrusted client certificate
- proves the Node client rejects an unpinned server certificate
- proves server and client PEM rotation are picked up on new connections without restarting the Node API client
