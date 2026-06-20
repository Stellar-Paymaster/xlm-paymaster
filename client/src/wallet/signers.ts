/**
 * Concrete {@link WalletSigner} implementations beyond WalletConnect.
 *
 * - {@link KeypairSigner}   — signs in-process with a Stellar `Keypair`. Useful
 *   for Node demos, automated tests, and server-side signing.
 * - {@link Sep43WalletSigner} — adapts any browser wallet that already speaks
 *   the SEP-43 standard interface (Freighter, Albedo, xBull, Stellar Wallets
 *   Kit, …) to the Paymaster universal signer contract.
 */

import StellarSdk, { Keypair } from "@stellar/stellar-sdk";
import {
  SignTransactionOptions,
  SignedTransaction,
  TransactionInput,
  WalletAddress,
  WalletSigner,
  toXdrString,
} from "./types";

/** The subset of `StellarSdk.Keypair` that {@link KeypairSigner} relies on. */
export interface KeypairLike {
  publicKey(): string;
  sign(data: Buffer): Buffer;
}

/**
 * Signs transactions in-process using a Stellar keypair.
 *
 * The keypair never leaves the process, so this binding is appropriate for
 * trusted environments only (local demos, tests, backends) — not for shipping
 * a user's secret key into a browser bundle.
 */
export class KeypairSigner implements WalletSigner {
  readonly id = "keypair";

  private readonly keypair: KeypairLike;
  private readonly networkPassphrase: string;

  constructor(keypair: KeypairLike, networkPassphrase: string) {
    if (!keypair || typeof keypair.sign !== "function") {
      throw new Error("KeypairSigner requires a Stellar Keypair");
    }
    if (!networkPassphrase) {
      throw new Error("KeypairSigner requires a network passphrase");
    }
    this.keypair = keypair;
    this.networkPassphrase = networkPassphrase;
  }

  async getAddress(): Promise<WalletAddress> {
    return { address: this.keypair.publicKey() };
  }

  async signTransaction(
    transaction: TransactionInput,
    options: SignTransactionOptions = {},
  ): Promise<SignedTransaction> {
    const xdr = toXdrString(transaction);
    const passphrase = options.networkPassphrase ?? this.networkPassphrase;

    const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, passphrase);
    tx.sign(this.keypair as unknown as Keypair);

    return {
      signedTxXdr: tx.toXDR(),
      signerAddress: this.keypair.publicKey(),
    };
  }
}

/**
 * The SEP-43 standard wallet interface as exposed by browser wallets.
 *
 * Most fields are optional because real wallets implement varying subsets; the
 * adapter only requires `signTransaction`.
 */
export interface Sep43Wallet {
  signTransaction(
    xdr: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
      network?: string;
    },
  ): Promise<{ signedTxXdr: string; signerAddress?: string } | string>;
  getAddress?(): Promise<{ address: string }>;
  getPublicKey?(): Promise<string>;
}

/**
 * Adapts a SEP-43 compliant browser wallet to the Paymaster universal signer.
 *
 * This is the bridge that lets the standard wallet bindings (Freighter, the
 * Stellar Wallets Kit selector, WalletConnect-over-Kit, …) plug straight into
 * {@link PaymasterClient.buildAndRequestFeeBumpWithWallet} without bespoke glue.
 */
export class Sep43WalletSigner implements WalletSigner {
  readonly id: string;

  private readonly wallet: Sep43Wallet;
  private readonly networkPassphrase?: string;

  constructor(
    wallet: Sep43Wallet,
    options: { id?: string; networkPassphrase?: string } = {},
  ) {
    if (!wallet || typeof wallet.signTransaction !== "function") {
      throw new Error("Sep43WalletSigner requires a wallet with signTransaction()");
    }
    this.wallet = wallet;
    this.id = options.id ?? "sep43";
    this.networkPassphrase = options.networkPassphrase;
  }

  async getAddress(): Promise<WalletAddress> {
    if (typeof this.wallet.getAddress === "function") {
      return this.wallet.getAddress();
    }
    if (typeof this.wallet.getPublicKey === "function") {
      return { address: await this.wallet.getPublicKey() };
    }
    throw new Error(
      "Wallet does not expose getAddress()/getPublicKey(); pass the address explicitly",
    );
  }

  async signTransaction(
    transaction: TransactionInput,
    options: SignTransactionOptions = {},
  ): Promise<SignedTransaction> {
    const xdr = toXdrString(transaction);
    const networkPassphrase = options.networkPassphrase ?? this.networkPassphrase;

    const result = await this.wallet.signTransaction(xdr, {
      networkPassphrase,
      address: options.address,
    });

    if (typeof result === "string") {
      return { signedTxXdr: result, signerAddress: options.address };
    }

    return {
      signedTxXdr: result.signedTxXdr,
      signerAddress: result.signerAddress ?? options.address,
    };
  }
}
