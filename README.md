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
FLUID_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
PORT=3000
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
```
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

## 🎯 Community Demo dApps

We provide reference implementations showcasing Fluid across different Stellar use cases:

### Classic Stellar Payments
**Gasless XLM Payment Demo** - The simplest use case: send XLM with zero fees.
- **Live**: https://stellar-fluid.github.io/react-classic-payment/
- **Repo**: `client/examples/react-classic-payment/`
- **Features**: Freighter wallet integration, Fluid fee sponsorship, Stellar Expert confirmation
- **Deployment**: GitHub Pages (auto-deployed on main branch)

### Soroban Smart Contracts
**Gasless NFT Minting** - Mint NFTs on Soroban without paying gas.
- **Live**: https://fluid-nft-demo.vercel.app/
- **Repo**: `client/examples/react-nft-minting/` + `server/src/contracts/soroban/nft-demo/`
- **Features**: Soroban contract, metadata storage, Freighter signing, gasless execution
- **Deployment**: Vercel

### Decentralized Finance
**Gasless Token Swap** - Trade tokens on Soroswap AMM with Fluid sponsorship.
- **Live**: https://fluid-swap-demo.vercel.app/
- **Repo**: `client/examples/react-token-swap/`
- **Features**: Soroswap integration, price quotes, gasless execution, transaction confirmation
- **Deployment**: Vercel

### Getting Started with Examples

```bash
# Classic payment demo (local dev)
cd client/examples/react-classic-payment
npm install
npm run dev

# NFT minting demo
cd client/examples/react-nft-minting
npm install
npm run dev

# Token swap demo
cd client/examples/react-token-swap
npm install
npm run dev
```

## 🌐 Public Testnet Node

Access Fluid for free via our managed public testnet endpoint:

**Endpoint**: `https://testnet.fluid.dev`

### Getting Started

1. **Get a Free API Key**
   - Navigate to https://testnet.fluid.dev/developer
   - Sign in or create account
   - Generate free API key (100 bumps/day included)

2. **Use in Your App**
   ```typescript
   import { FluidClient } from '@fluid-sdk/client';

   const fluid = new FluidClient({
     serverUrl: 'https://testnet.fluid.dev',
     horizonUrl: 'https://horizon-testnet.stellar.org',
     apiKey: 'your-api-key-here'
   });

   const result = await fluid.requestFeeBump(signedTransactionXdr);
   ```

3. **Monitor Usage**
   - Check dashboard: https://testnet.fluid.dev/dashboard
   - View status: https://testnet.fluid.dev/status
   - Track uptime: https://testnet.fluid.dev/status/uptime

### Free Tier Limits
- **Rate**: 100 fee-bump transactions per 24 hours
- **Max fee per bump**: 1 XLM
- **Network**: Stellar testnet only

### Upgrade for Higher Limits
Contact us at hello@stellar-fluid.dev for production credentials or increased rate limits.

## Architecture Decisions

Key architectural choices (why Rust, why gRPC, why Prisma) are documented as Architecture Decision Records in [`docs/adr/`](docs/adr/README.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, pull request guidelines, and code style requirements.

## Sponsors

Fluid is free, open-source software. Sponsorships help cover infrastructure costs and sustain active development.

[![Sponsor Fluid](https://img.shields.io/badge/Sponsor-Fluid-brightgreen?logo=github-sponsors)](https://github.com/sponsors/Stellar-Fluid)

### Sponsor tiers

| Tier | Monthly | Benefits |
|---|---|---|
| **Supporter** | $5 | Name in the monthly transparency report |
| **Bronze** | $25 | Name + link in `README.md` |
| **Silver** | $100 | Logo in `README.md` + priority issue triage |
| **Gold** | $500 | Logo, dedicated support channel, and co-marketing |

To sponsor via Stellar directly, send XLM or USDC to the project's public key listed at [stellar-fluid.dev/sponsor](https://stellar-fluid.dev/sponsor).

> Sponsor fund usage is published in the [monthly transparency report](docs/reports/).

## Migration

See `MIGRATION_GUIDE.md` for the Rust cutover path, environment mapping, and rollout guidance.
