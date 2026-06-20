import { createLogger, serializeError } from "../src/utils/logger";

import StellarSdk from "@stellar/stellar-sdk";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();


const logger = createLogger({ component: "test_fee_bump_script" });

const serverUrl = "http://localhost:3000/fee-bump";

// Ensure secret exists
const sourceSecret = process.env.PAYMASTER_FEE_PAYER_SECRET;

if (!sourceSecret) {
  throw new Error("PAYMASTER_FEE_PAYER_SECRET is not set in environment variables");
}

// Create keypair
const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);

async function main () {
  const server = new StellarSdk.Horizon.Server(
    "https://horizon-testnet.stellar.org",
  );

  const account = await server.loadAccount(sourceKeypair.publicKey());

  // Build transaction
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "10",
      }),
    )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "20",
      }),
    )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "30",
      }),
    )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "40",
      }),
    )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "50",
      }),
    )
    .setTimeout(0)
    .build();

  // Sign transaction
  tx.sign(sourceKeypair);

  const xdr = tx.toXDR();

  // Send to backend with API key
  const response = await axios.post(
    serverUrl,
    {
      xdr,
      submit: true,
    },
    {
      headers: {
        "x-api-key": "paymaster-free-demo-key",
      },
    },
  );

  logger.info({ response: response.data }, "Received fee bump response");
}

main().catch((error) => {
  logger.error({ ...serializeError(error) }, "Fee bump test script failed");
  process.exitCode = 1;
});
