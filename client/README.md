# Fluid Client

TypeScript client library for interacting with Fluid servers.

## Installation

```bash
npm install
```

## Usage

```typescript
import { FluidClient } from "fluid-client";
import StellarSdk from "@stellar/stellar-sdk";

const client = new FluidClient({
  serverUrl: "http://localhost:3000",
  networkPassphrase: StellarSdk.Networks.TESTNET,
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
});

const transaction = new StellarSdk.TransactionBuilder(account, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET,
})
  .addOperation(/* your operation */)
  .build();

transaction.sign(keypair);

const result = await client.requestFeeBump(transaction, false);
const submitResult = await client.submitFeeBumpTransaction(result.xdr);
```

## Soroban SAC helper

```typescript
import StellarSdk from "@stellar/stellar-sdk";
import { FluidClient } from "./src";

const client = new FluidClient({
  serverUrl: "http://localhost:3000",
  networkPassphrase: StellarSdk.Networks.TESTNET,
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
});

const prepared = await client.buildSACTransferTx({
  source: "G...SOURCE",
  destination: "G...DESTINATION",
  asset: "native",
  amount: "1000000",
});

console.log(prepared.toXDR());
```

Supported `asset` inputs:

- `"native"` or `"xlm"` for Native XLM
- `"CODE:ISSUER"` for issued assets
- `new StellarSdk.Asset(code, issuer)`
- `{ code, issuer }`

Soroban-specific options:

- `sorobanRpcUrl`: required so the SDK can simulate and prepare the invoke-host-function transaction
- `amount`: must be provided in integer base units expected by the SAC
- `timeoutInSeconds`: optional transaction timeout, default `180`
- `fee`: optional base fee before Soroban resource fees are added during preparation
- `sourceAccount`: optional preloaded source account if you want to avoid an extra RPC call

To print a successfully generated SAC transfer XDR on testnet:

```bash
npm run demo:sac-transfer-xdr
```

## API

### `FluidClient`

#### Constructor

```typescript
new FluidClient(config: {
  serverUrl: string;
  networkPassphrase: string;
  horizonUrl?: string;
  sorobanRpcUrl?: string;
  enableTelemetry?: boolean;   // Enable anonymous telemetry (default: false)
  telemetryEndpoint?: string;  // Custom telemetry endpoint
  enableDiagnostics?: boolean; // Enable bug reporting (default: false)
  diagnosticsEndpoint?: string;// Custom diagnostics endpoint
})
```

#### Methods

- `requestFeeBump(transactionOrXdr, submit?)` - Request a fee-bump
- `submitFeeBumpTransaction(feeBumpXdr)` - Submit a fee-bump to Horizon
- `buildAndRequestFeeBump(transaction, submit?)` - Build, sign, and request fee-bump
- `reportBug(message, context?)` - Report a bug or diagnostic info (requires `enableDiagnostics: true`)

### `FluidMockClient` (New!)

For unit testing without network calls:

```typescript
import { FluidMockClient } from "fluid-client";

const mockClient = new FluidMockClient();
mockClient.setMockResponse("requestFeeBump", { status: "success", hash: "mock-hash" });

const result = await mockClient.requestFeeBump(tx);
console.log(result.hash); // "mock-hash"
```

## Anonymous Usage Telemetry & Diagnostics

The Fluid SDK includes optional, anonymous telemetry and diagnostics to help improve the library.

**Both features are disabled by default (opt-in).**

### What is Collected?

- **Telemetry**: SDK version, domain, and timestamp (once per day).
- **Diagnostics**: Bug reports, error messages, and context you provide.

**No personal data or wallet addresses are collected without your explicit context.**

For more details, see [TELEMETRY.md](TELEMETRY.md).


## Development

```bash
npm run build
npm run dev
npm run demo:sac-transfer-xdr
```

## Local Sandbox Docker Compose

Use one command to spin up a local sandbox with Fluid server, PostgreSQL, and a mock Horizon endpoint:

```bash
npm run sandbox:up
```

The compose file is generated at `src/sandbox/docker-compose.local.yml`.

Useful commands:

```bash
npm run sandbox:ps
npm run sandbox:logs
npm run sandbox:down
```
