# XLM Paymaster × Blend Protocol: Gasless Lending Interactions

This guide covers integrating XLM Paymaster with [Blend Protocol](https://blend.capital) so users can supply collateral, borrow, repay, and withdraw without holding XLM.

## Why this matters

Every Blend interaction (supply, borrow, repay, withdraw) is a Stellar transaction that costs network fees. Users who arrive with only USDC or another asset cannot interact at all until they acquire XLM. XLM Paymaster eliminates this barrier.

## Prerequisites

- A running XLM Paymaster server
- Blend Protocol SDK / contract IDs for the target network
- A funded XLM Paymaster fee-payer account

## Pattern

All Blend interactions follow the same three-step pattern:

1. Build the Soroban contract invocation transaction.
2. Sign it with the user's wallet (the user's signature is required; the fee-payer only wraps it).
3. Send the signed XDR to XLM Paymaster and submit the resulting fee-bump.

## Supply collateral — gasless

```ts
import { Contract, Networks, TransactionBuilder, Keypair } from "@stellar/stellar-sdk";
import { PaymasterClient } from "paymaster-client";

const NETWORK = Networks.TESTNET;
const HORIZON = "https://horizon-testnet.stellar.org";
const BLEND_POOL_CONTRACT = "CBLEND..."; // replace with actual contract ID

async function gaslessSupply(userSecret: string, assetCode: string, amount: bigint) {
  const userKp  = Keypair.fromSecret(userSecret);
  const xlm-paymaster   = new PaymasterClient({ serverUrl: process.env.PAYMASTER_URL!, networkPassphrase: NETWORK, horizonUrl: HORIZON });

  // Build the Soroban supply invocation
  const contract = new Contract(BLEND_POOL_CONTRACT);
  const account  = await (await import("@stellar/stellar-sdk")).SorobanRpc.Server(HORIZON).getAccount(userKp.publicKey());

  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: NETWORK })
    .addOperation(contract.call("supply",
      // Blend contract arguments: caller, asset, amount
      // Replace with the actual ABI from Blend's documentation
    ))
    .setTimeout(30)
    .build();

  tx.sign(userKp);

  const { xdr } = await xlm-paymaster.requestFeeBump(tx.toXDR());
  // submit xdr ...
  return xdr;
}
```

## Borrow — gasless

```ts
async function gaslessBorrow(userSecret: string, assetCode: string, amount: bigint) {
  const userKp = Keypair.fromSecret(userSecret);
  const xlm-paymaster  = new PaymasterClient({ serverUrl: process.env.PAYMASTER_URL!, networkPassphrase: NETWORK, horizonUrl: HORIZON });

  const contract = new Contract(BLEND_POOL_CONTRACT);
  const account  = await getAccount(userKp.publicKey());

  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: NETWORK })
    .addOperation(contract.call("borrow", /* borrower, asset, amount */))
    .setTimeout(30)
    .build();

  tx.sign(userKp);

  const { xdr } = await xlm-paymaster.requestFeeBump(tx.toXDR());
  return xdr;
}
```

## Repay — gasless

```ts
async function gaslessRepay(userSecret: string, assetCode: string, amount: bigint) {
  const userKp = Keypair.fromSecret(userSecret);
  const xlm-paymaster  = new PaymasterClient({ serverUrl: process.env.PAYMASTER_URL!, networkPassphrase: NETWORK, horizonUrl: HORIZON });

  const contract = new Contract(BLEND_POOL_CONTRACT);
  const account  = await getAccount(userKp.publicKey());

  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: NETWORK })
    .addOperation(contract.call("repay", /* from, asset, amount */))
    .setTimeout(30)
    .build();

  tx.sign(userKp);

  const { xdr } = await xlm-paymaster.requestFeeBump(tx.toXDR());
  return xdr;
}
```

## Security note

The user's keypair signs the **inner** transaction. The XLM Paymaster server signs only the **outer** fee-bump envelope and never has access to user funds. Blend's contract enforces the caller's signature independently.

## Error handling

```ts
try {
  const { xdr } = await xlm-paymaster.requestFeeBump(signedXdr);
  await submitTransaction(xdr);
} catch (err) {
  if (err.response?.status === 429) {
    // Rate limited — back off and retry
  }
  if (err.message?.includes("insufficient fee")) {
    // Raise PAYMASTER_BASE_FEE or PAYMASTER_FEE_MULTIPLIER
  }
  throw err;
}
```
