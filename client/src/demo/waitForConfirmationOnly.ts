import StellarSdk from "@stellar/stellar-sdk";
import dotenv from "dotenv";

import { PaymasterClient } from "../index";

dotenv.config();

async function main() {
  const horizonUrl =
    process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  const networkPassphrase =
    process.env.NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;

  // serverUrl isn't used for this demo; we only need Horizon + network.
  const client = new PaymasterClient({
    serverUrl: "http://unused.local",
    networkPassphrase,
    horizonUrl,
  });

  const userKeypair = StellarSdk.Keypair.random();
  console.log("[demo] user wallet:", userKeypair.publicKey());

  if (horizonUrl.includes("testnet")) {
    console.log("[demo] funding via friendbot...");
    await fetch(`https://friendbot.stellar.org?addr=${userKeypair.publicKey()}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  const server = new StellarSdk.Horizon.Server(horizonUrl);
  const account = await server.loadAccount(userKeypair.publicKey());

  const newAccount = StellarSdk.Keypair.random();
  console.log("[demo] creating new account:", newAccount.publicKey());

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.createAccount({
        destination: newAccount.publicKey(),
        startingBalance: "2",
      })
    )
    .setTimeout(180)
    .build();

  tx.sign(userKeypair);

  console.log("[demo] submitting transaction to horizon...");
  const submit = await server.submitTransaction(tx);
  const hash = submit.hash as string;
  console.log("[demo] submitted. hash:", hash);

  console.log("[demo] waiting for confirmation (polling horizon)...");
  const confirmed = await client.waitForConfirmation(hash, 90_000, {
    pollIntervalMs: 1_500,
    onProgress: (p) => {
      console.log(
        `[demo] polling attempt=${p.attempt} elapsedMs=${p.elapsedMs} hash=${p.hash}`
      );
    },
  });

  console.log("[demo] confirmed in ledger:", confirmed.ledger);
  console.log("[demo] result_xdr:", confirmed.result_xdr);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[demo] failed:", e);
    process.exitCode = 1;
  });
}

