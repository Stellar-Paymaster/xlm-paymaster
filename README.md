# Fluid - Stellar Fee Sponsorship Service

Fluid enables gasless Stellar transactions by abstracting network fees. Users sign transactions locally, and Fluid wraps them in fee-bump transactions so applications can sponsor XLM fees while users transact in the asset they actually want to use.

## Status

`fluid-server/` is now the primary production backend.

`server/` remains in the repository as a Node.js parity server and migration harness while the Rust rollout completes.

## Quick Start

### Prerequisites

- Rust toolchain with `cargo`
- Node.js 18+ and npm for parity checks and the TypeScript client
- A Stellar account with XLM for fee payments

### Start the Rust Server

```bash
git clone <repository-url>
cd fluid/fluid-server
cargo build
cargo run
```

The Rust server listens on `http://localhost:3000` by default.

### Required Environment

The Rust server uses the same environment variable names as the legacy Node server:

```bash
FLUID_FEE_PAYER_SECRET=YOUR_STELLAR_SECRET_KEY
FLUID_BASE_FEE=100
FLUID_FEE_MULTIPLIER=2.0
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_HORIZON_URLS=
FLUID_HORIZON_SELECTION=priority
FLUID_RATE_LIMIT_WINDOW_MS=60000
FLUID_RATE_LIMIT_MAX=5
<<<<<<< HEAD
FLUID_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
FLUID_LOW_BALANCE_THRESHOLD_XLM=50
FLUID_LOW_BALANCE_CHECK_INTERVAL_MS=3600000
FLUID_LOW_BALANCE_ALERT_COOLDOWN_MS=21600000
FLUID_ALERT_SLACK_WEBHOOK_URL=
FLUID_ALERT_SMTP_HOST=
FLUID_ALERT_SMTP_PORT=587
FLUID_ALERT_SMTP_SECURE=false
FLUID_ALERT_SMTP_USER=
FLUID_ALERT_SMTP_PASS=
FLUID_ALERT_EMAIL_FROM=
FLUID_ALERT_EMAIL_TO=
=======
FLUID_ALLOWED_ORIGINS=
PORT=3000
>>>>>>> upstream/main
```

## API

The Rust server handles:

- `GET /`
- `GET /dashboard`
- `GET /health`
- `POST /fee-bump`
- `POST /test/add-transaction`
- `GET /test/transactions`

## Verification

Rust-only verification:

```bash
cd fluid-server
cargo test rust_server_handles_static_and_api_without_node --test rust_only_verification -- --nocapture
```

Horizon failover verification with reviewer-friendly logs:

```bash
cd fluid-server
cargo test retries_failed_submission_on_secondary_node_and_logs_statuses -- --nocapture
```

Node-vs-Rust parity verification:

```bash
cd ../server
npm install
npm run parity:rust
```

## Client

The TypeScript client remains in `client/` and can continue targeting the same HTTP API.

### CDN / Script-Tag Usage (no build step required)

For projects that don't use a bundler, load Fluid directly from a CDN:

```html
<!-- unpkg (latest) -->
<script src="https://unpkg.com/fluid-client@latest/dist/fluid.min.js"></script>

<!-- jsDelivr (latest) -->
<script src="https://cdn.jsdelivr.net/npm/fluid-client@latest/dist/fluid.min.js"></script>

<!-- pinned version (recommended for production) -->
<script src="https://unpkg.com/fluid-client@0.1.0/dist/fluid.min.js"></script>
```

The bundle exposes a global `Fluid` object:

```html
<script src="https://unpkg.com/fluid-client@latest/dist/fluid.min.js"></script>
<script>
  // All exports are available under the Fluid namespace
  console.log(Fluid.VERSION); // "0.1.0"

  const client = new Fluid.FluidClient({
    serverUrl: 'https://your-fluid-server.example.com',
    networkPassphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  });

  // Sign your transaction with the user's wallet, then request a fee-bump
  const result = await client.requestFeeBump(signedTransactionXdr);
  console.log('Fee-bump XDR:', result.xdr);
</script>
```

#### Building the standalone bundle locally

```bash
cd client
npm install
npm run build:standalone   # outputs client/dist/fluid.min.js
```

A self-contained demo is available at [`client/demo/cdn-demo.html`](client/demo/cdn-demo.html) — open it in a browser after building.

## Migration

See `MIGRATION_GUIDE.md` for the Rust cutover path, environment mapping, and rollout guidance.
