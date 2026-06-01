import assert from "node:assert/strict";
import {
  FluidClient,
  buildFeeBumpTransaction,
  createHorizonServer,
  fromTransactionXdr,
  getSdkFamily,
  isTransactionLike,
  resolveStellarSdk,
  toTransactionXdr,
} from "../src/index";

type SdkCase = {
  label: string;
  packageName: string;
  expectedFamily: "legacy" | "scoped";
};

const SDK_CASES: SdkCase[] = [
  {
    label: "stellar-sdk v10.x",
    packageName: "stellar-sdk-v10",
    expectedFamily: "legacy",
  },
  {
    label: "@stellar/stellar-sdk v11.x",
    packageName: "stellar-sdk-v11",
    expectedFamily: "scoped",
  },
];

async function main(): Promise<void> {
  for (const sdkCase of SDK_CASES) {
    await runCompatibilityCase(sdkCase);
  }

  console.log("Compatibility matrix passed for all Stellar SDK versions.");
}

async function runCompatibilityCase(sdkCase: SdkCase): Promise<void> {
  const rawModule = require(sdkCase.packageName);
  const sdk = resolveStellarSdk(rawModule) as any;

  assert.equal(
    getSdkFamily(rawModule),
    sdkCase.expectedFamily,
    `${sdkCase.label}: expected family ${sdkCase.expectedFamily}`
  );

  const signedTransaction = createSignedTransaction(sdk);
  assert.ok(
    isTransactionLike(signedTransaction),
    `${sdkCase.label}: signed transaction should be detected`
  );

  const signedXdr = toTransactionXdr(signedTransaction);
  assert.match(signedXdr, /^[A-Za-z0-9+/=]+$/, `${sdkCase.label}: expected base64 XDR`);

  const parsedTransaction = fromTransactionXdr(rawModule, signedXdr, sdk.Networks.TESTNET);
  assert.ok(
    isTransactionLike(parsedTransaction),
    `${sdkCase.label}: parsed transaction should be detected`
  );
  assert.equal(
    toTransactionXdr(parsedTransaction),
    signedXdr,
    `${sdkCase.label}: parsed transaction should round-trip`
  );

  const feePayer = sdk.Keypair.random();
  const feeBumpTransaction = buildFeeBumpTransaction(rawModule, {
    feeSource: feePayer,
    baseFee: sdk.BASE_FEE,
    innerTransaction: signedTransaction,
    networkPassphrase: sdk.Networks.TESTNET,
  });

  assert.ok(
    isTransactionLike(feeBumpTransaction),
    `${sdkCase.label}: fee bump transaction should be detected`
  );

  const feeBumpXdr = toTransactionXdr(feeBumpTransaction);
  const horizonServer = createHorizonServer(rawModule, "https://horizon-testnet.stellar.org") as any;
  assert.equal(
    typeof horizonServer.submitTransaction,
    "function",
    `${sdkCase.label}: Horizon server should expose submitTransaction()`
  );

  const requestClient = new FluidClient({
    serverUrl: "https://fluid.example",
    networkPassphrase: sdk.Networks.TESTNET,
    stellarSdk: rawModule,
  });

  let requestedXdr = "";
  requestClient.requestFeeBump = async (xdr: string, submit = false) => {
    requestedXdr = xdr;
    return {
      xdr: feeBumpXdr,
      status: submit ? "submitted" : "pending",
      hash: "compatibility-hash",
    };
  };

  const requestResult = await requestClient.buildAndRequestFeeBump(signedTransaction, true);
  assert.equal(
    requestedXdr,
    signedXdr,
    `${sdkCase.label}: buildAndRequestFeeBump should serialize the incoming transaction`
  );
  assert.equal(requestResult.xdr, feeBumpXdr, `${sdkCase.label}: request result should be returned`);

  const submitClient = new FluidClient({
    serverUrl: "https://fluid.example",
    networkPassphrase: sdk.Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    stellarSdk: rawModule,
  });

  let submittedTransaction: unknown;
  (submitClient as any).horizonServer = {
    submitTransaction: async (transaction: unknown) => {
      submittedTransaction = transaction;
      return { hash: "submitted-hash" };
    },
  };

  const submitResult = await submitClient.submitFeeBumpTransaction(feeBumpXdr);
  assert.equal(submitResult.hash, "submitted-hash", `${sdkCase.label}: submit result should bubble up`);
  assert.ok(
    isTransactionLike(submittedTransaction),
    `${sdkCase.label}: submitFeeBumpTransaction should rehydrate a transaction object`
  );
  assert.equal(
    toTransactionXdr(submittedTransaction),
    feeBumpXdr,
    `${sdkCase.label}: submitted transaction should match the original fee bump XDR`
  );

  console.log(`PASS ${sdkCase.label}`);
}

function createSignedTransaction(sdk: any): unknown {
  const source = sdk.Keypair.random();
  const destination = sdk.Keypair.random();
  const account = new sdk.Account(source.publicKey(), "123");

  const transaction = new sdk.TransactionBuilder(account, {
    fee: sdk.BASE_FEE,
    networkPassphrase: sdk.Networks.TESTNET,
  })
    .addOperation(
      sdk.Operation.payment({
        destination: destination.publicKey(),
        asset: sdk.Asset.native(),
        amount: "1",
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(source);
  return transaction;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
