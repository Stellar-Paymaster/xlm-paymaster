# Optional gRPC Transport

The TypeScript client SDK now supports an optional `grpc-web` transport for latency-sensitive deployments.

## When to use it

Use the gRPC transport when your deployment already exposes a gRPC-web compatible endpoint and you want to avoid JSON encoding overhead for fee-bump requests.

The default transport remains JSON over HTTP, so existing integrations do not need to change.

## Configuration

```ts
import { FluidClient } from "fluid-client";

const client = new FluidClient({
  serverUrl: "https://grpc.fluid.example",
  networkPassphrase: "Test SDF Network ; September 2015",
  transport: "grpc-web",
  grpc: {
    serviceName: "fluid.v1.FeeBumpService",
    methodNames: {
      requestFeeBump: "RequestFeeBump",
      requestFeeBumpBatch: "RequestFeeBumpBatch",
    },
    headers: {
      "x-client-id": "ops-dashboard",
    },
  },
});
```

## Protocol shape

- `requestFeeBump` uses a unary gRPC-web call with the fields `xdr` and `submit`.
- `requestFeeBumpBatch` uses a unary gRPC-web call with repeated `xdrs` and `submit`.
- Responses are encoded as protobuf messages framed with standard gRPC-web headers and trailers.

## Failure handling

- Network failures are retried across configured server URLs.
- gRPC status `3` maps to a non-retryable client error.
- Other gRPC failures are mapped to the existing `FluidServerError` / `FluidNetworkError` flow so fallback behavior stays consistent.
