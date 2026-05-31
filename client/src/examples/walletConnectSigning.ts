/**
 * Example: universal wallet signing with the Fluid client.
 *
 * Demonstrates the standard WalletConnect bindings and the wallet-agnostic
 * signer contract end to end, entirely offline:
 *
 *   1. Build the WalletConnect `requiredNamespaces` for a Stellar session.
 *   2. Parse the account a wallet advertises on a connected session.
 *   3. Sign a transaction through a WalletConnect session (mock provider here,
 *      a real `@walletconnect/sign-client` in production).
 *   4. Sign the same transaction through an in-process keypair, showing the
 *      identical {@link WalletSigner} interface.
 *
 * Run it with:
 *
 *   npm run demo:wallet-connect
 */

import StellarSdk, { Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  KeypairSigner,
  STELLAR_CHAINS,
  WalletConnectProvider,
  WalletConnectSession,
  WalletSigner,
  buildStellarRequiredNamespaces,
  createWalletConnectSigner,
  parseStellarAccounts,
} from "../wallet";

const NETWORK = StellarSdk.Networks.TESTNET;

/** Build an unsigned testnet payment transaction without touching the network. */
function buildUnsignedPayment(sourcePublicKey: string): Transaction {
  const account = new StellarSdk.Account(sourcePublicKey, "1");
  return new TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: StellarSdk.Keypair.random().publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(180)
    .build();
}

/**
 * A stand-in for a real WalletConnect `SignClient`. In production this is the
 * connected provider; here it signs with a local keypair so the example runs
 * without a paired mobile wallet.
 */
function createMockWalletConnectProvider(
  keypair: Keypair,
): WalletConnectProvider {
  return {
    async request<T>({ request }: { request: { method: string; params: unknown } }): Promise<T> {
      const { xdr } = request.params as { xdr: string };
      const tx = TransactionBuilder.fromXDR(xdr, NETWORK);
      tx.sign(keypair);
      return { signedXDR: tx.toXDR() } as T;
    },
  };
}

async function signAndReport(label: string, signer: WalletSigner, xdr: string) {
  const { address } = await signer.getAddress();
  const { signedTxXdr, signerAddress } = await signer.signTransaction(xdr, {
    networkPassphrase: NETWORK,
  });
  const signatures = (
    TransactionBuilder.fromXDR(signedTxXdr, NETWORK) as Transaction
  ).signatures.length;

  console.log(`\n[${label}] signer.id = ${signer.id}`);
  console.log(`  address:        ${address}`);
  console.log(`  signerAddress:  ${signerAddress}`);
  console.log(`  signatures:     ${signatures}`);
  console.log(`  signedTxXdr:    ${signedTxXdr.slice(0, 44)}…`);
}

async function main() {
  console.log("=== Fluid universal wallet signing demo ===");

  // (1) The namespaces an app requests when opening a WalletConnect session.
  const requiredNamespaces = buildStellarRequiredNamespaces({
    chains: [STELLAR_CHAINS.TESTNET],
  });
  console.log("\nWalletConnect requiredNamespaces:");
  console.log(JSON.stringify(requiredNamespaces, null, 2));

  // The wallet's keypair (in a real flow this lives in the user's wallet).
  const walletKeypair = StellarSdk.Keypair.random();

  // (2) A connected session reports the account it authorized.
  const session: WalletConnectSession = {
    topic: "demo-topic",
    namespaces: {
      stellar: {
        accounts: [`${STELLAR_CHAINS.TESTNET}:${walletKeypair.publicKey()}`],
        methods: ["stellar_signXDR", "stellar_signAndSubmitXDR"],
        events: [],
      },
    },
  };
  console.log("\nParsed accounts from session:");
  console.log(parseStellarAccounts(session));

  const unsignedXdr = buildUnsignedPayment(walletKeypair.publicKey()).toXDR();
  console.log(`\nUnsigned XDR: ${unsignedXdr.slice(0, 44)}…`);

  // (3) Sign through a WalletConnect session.
  const provider = createMockWalletConnectProvider(walletKeypair);
  const walletConnectSigner = createWalletConnectSigner(provider, session, {
    networkPassphrase: NETWORK,
  });
  await signAndReport("WalletConnect", walletConnectSigner, unsignedXdr);

  // (4) Sign through an in-process keypair using the same interface.
  const keypairSigner = new KeypairSigner(walletKeypair, NETWORK);
  await signAndReport("Keypair", keypairSigner, unsignedXdr);

  console.log(
    "\nBoth signers implement the same WalletSigner contract, so " +
      "client.buildAndRequestFeeBumpWithWallet(signer, tx) works for either.",
  );
  console.log("\n=== demo complete ===");
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
