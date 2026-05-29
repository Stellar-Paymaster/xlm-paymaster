# Fluid × NFT Projects: Gasless Minting Pattern

This guide shows the recommended pattern for enabling gasless NFT minting on Stellar using Fluid, so collectors can mint without ever holding XLM.

## Why this matters

NFT projects on Stellar lose potential buyers who hold USDC or other assets but not XLM. The Fluid gasless-minting pattern eliminates this friction: the project (or a sponsoring treasury) covers the network fee, and the collector's wallet only needs to sign.

## How it works

```
Collector wallet ──sign──▶ Mint transaction (inner)
                                     │
                     Fluid server ───▶ Fee-bump envelope (outer)
                                     │
                            Stellar network
```

The collector's signature on the inner transaction proves ownership of the asset and NFT collection right. The fee-bump adds the project's XLM fee without altering or invalidating the inner signature.

## Prerequisites

- A Soroban NFT contract that follows the [SEP-0011 / token standard](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0011.md) or similar
- A running Fluid server with `FLUID_FEE_PAYER_SECRET` set to the treasury's key
- The Fluid TypeScript client (`npm install fluid-client`)

## Step-by-step

### 1. Build the mint transaction

```ts
import { Contract, TransactionBuilder, Keypair, Networks } from "@stellar/stellar-sdk";
import { SorobanRpc } from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL            = "https://soroban-testnet.stellar.org";
const NFT_CONTRACT_ID    = "CNFT..."; // your deployed contract

async function buildMintTx(collectorPublicKey: string, tokenId: string) {
  const server  = new SorobanRpc.Server(RPC_URL);
  const account = await server.getAccount(collectorPublicKey);

  const contract = new Contract(NFT_CONTRACT_ID);

  return new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "mint",
        // Arguments depend on your contract ABI:
        // e.g. { to: collectorPublicKey, token_id: tokenId, metadata_uri: "ipfs://..." }
      )
    )
    .setTimeout(30)
    .build();
}
```

### 2. Collect the collector's signature

In a browser wallet (Freighter, Lobstr, etc.):

```ts
import freighter from "@stellar/freighter-api";

const tx          = await buildMintTx(await freighter.getPublicKey(), "nft-001");
const signedXdr   = await freighter.signTransaction(tx.toXDR(), { network: "TESTNET" });
```

### 3. Request a fee-bump from Fluid

```ts
import { FluidClient } from "fluid-client";

const fluid = new FluidClient({
  serverUrl:         "https://your-fluid-server.example.com",
  networkPassphrase: NETWORK_PASSPHRASE,
  horizonUrl:        "https://horizon-testnet.stellar.org",
});

const { xdr: feeBumpXdr } = await fluid.requestFeeBump(signedXdr);
```

### 4. Submit

```ts
import { Server, TransactionBuilder } from "@stellar/stellar-sdk";

const horizon = new Server("https://horizon-testnet.stellar.org");
const result  = await horizon.submitTransaction(
  TransactionBuilder.fromXDR(feeBumpXdr, NETWORK_PASSPHRASE)
);
console.log("Mint hash:", result.hash);
```

## Full end-to-end example (browser)

```ts
import freighter from "@stellar/freighter-api";
import { FluidClient } from "fluid-client";
import { Contract, TransactionBuilder, Networks, SorobanRpc, Server } from "@stellar/stellar-sdk";

const NETWORK = Networks.TESTNET;
const FLUID   = new FluidClient({
  serverUrl: "https://your-fluid-server.example.com",
  networkPassphrase: NETWORK,
  horizonUrl: "https://horizon-testnet.stellar.org",
});

export async function gaslessMint(tokenId: string, metadataUri: string) {
  const publicKey = await freighter.getPublicKey();
  const rpc       = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
  const account   = await rpc.getAccount(publicKey);

  const contract = new Contract("CNFT_CONTRACT_ID");
  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: NETWORK })
    .addOperation(contract.call("mint" /*, args */))
    .setTimeout(30)
    .build();

  const signedXdr       = await freighter.signTransaction(tx.toXDR(), { network: "TESTNET" });
  const { xdr: bumped } = await FLUID.requestFeeBump(signedXdr);

  const horizon = new Server("https://horizon-testnet.stellar.org");
  return horizon.submitTransaction(
    TransactionBuilder.fromXDR(bumped, NETWORK)
  );
}
```

## Cost estimation

Each gasless mint uses approximately `base_fee × fee_multiplier` stroops of XLM from the Fluid fee-payer account. At the default `FLUID_BASE_FEE=100` and `FLUID_FEE_MULTIPLIER=2.0`, that is 200 stroops (0.00002 XLM) per mint. A treasury of 1,000 XLM supports ~5 million gasless mints.

Monitor your fee-payer balance via `GET /health` or the Fluid dashboard.
