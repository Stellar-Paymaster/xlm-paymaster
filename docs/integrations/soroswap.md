# Fluid × Soroswap: Gasless Token Swaps

This guide shows how to integrate Fluid into [Soroswap](https://soroswap.finance) so your users can swap tokens without holding XLM for network fees.

## Why this matters

Soroswap users must hold XLM to pay Stellar network fees even when they only want to swap USDC → BTC. Fluid wraps the swap transaction in a fee-bump so your application pays fees on behalf of users, improving conversion rates and reducing onboarding friction.

## Prerequisites

- A running Fluid server (see the [README](../../README.md))
- Access to the Soroswap SDK (`@soroswap/sdk` or equivalent)
- A Stellar account with XLM funded as the Fluid fee-payer

## Integration steps

### 1. Install the Fluid client

```bash
npm install fluid-client
# or load via CDN — see README for script-tag usage
```

### 2. Build and sign the swap transaction

Use the Soroswap SDK to build a transaction invoking the AMM contract, then sign it with the **user's** keypair (never the fee-payer key):

```ts
import { SoroswapRouter } from "@soroswap/sdk";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

const userKeypair = Keypair.fromSecret(userSecret); // from wallet

const swapTx = await SoroswapRouter.buildSwapTransaction({
  fromAsset: "USDC:GABC...",
  toAsset:   "XLM",
  amount:    "100",
  slippage:  0.5,          // percent
  account:   userKeypair.publicKey(),
  network:   "testnet",
});

const signedXdr = swapTx.sign(userKeypair).toXDR();
```

### 3. Request a fee-bump from Fluid

```ts
import { FluidClient } from "fluid-client";

const fluid = new FluidClient({
  serverUrl:          "https://your-fluid-server.example.com",
  networkPassphrase:  "Test SDF Network ; September 2015",
  horizonUrl:         "https://horizon-testnet.stellar.org",
});

const { xdr: feeBumpXdr } = await fluid.requestFeeBump(signedXdr);
```

### 4. Submit the fee-bump transaction

```ts
import { Server } from "@stellar/stellar-sdk";

const horizon = new Server("https://horizon-testnet.stellar.org");
const result = await horizon.submitTransaction(
  TransactionBuilder.fromXDR(feeBumpXdr, "Test SDF Network ; September 2015")
);
console.log("Swap hash:", result.hash);
```

## Full working example

```ts
import { SoroswapRouter } from "@soroswap/sdk";
import { FluidClient } from "fluid-client";
import { Keypair, Server, TransactionBuilder } from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const HORIZON_URL        = "https://horizon-testnet.stellar.org";
const FLUID_URL          = "https://your-fluid-server.example.com";

export async function gaslessSwap(
  userSecret: string,
  fromAsset: string,
  toAsset: string,
  amount: string
) {
  const userKeypair = Keypair.fromSecret(userSecret);
  const horizon     = new Server(HORIZON_URL);
  const fluid       = new FluidClient({ serverUrl: FLUID_URL, networkPassphrase: NETWORK_PASSPHRASE, horizonUrl: HORIZON_URL });

  // Build + sign with user key
  const swapTx = await SoroswapRouter.buildSwapTransaction({
    fromAsset, toAsset, amount,
    slippage: 0.5,
    account: userKeypair.publicKey(),
    network: "testnet",
  });
  const signedXdr = swapTx.sign(userKeypair).toXDR();

  // Wrap in fee-bump
  const { xdr } = await fluid.requestFeeBump(signedXdr);
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  return horizon.submitTransaction(tx);
}
```

## Rate limits and cost management

Each call to `fluid.requestFeeBump` counts against the Fluid rate limit configured by `FLUID_RATE_LIMIT_MAX`. For a high-volume DEX, configure a dedicated Fluid tenant with raised limits:

```bash
FLUID_RATE_LIMIT_MAX=500
FLUID_RATE_LIMIT_WINDOW_MS=60000
```

Monitor XLM consumption via the Fluid dashboard at `GET /dashboard`.
