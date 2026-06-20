/**
 * Universal wallet signing types for the Paymaster client.
 *
 * These types describe a wallet-agnostic signing contract that example
 * applications can target regardless of how the underlying wallet is
 * delivered (browser extension, WalletConnect, in-memory keypair, …).
 *
 * The shape intentionally mirrors the de-facto Stellar standard wallet
 * interface (SEP-43): `signTransaction(xdr, opts)` resolves to an object that
 * carries the signed transaction envelope plus the address that signed it.
 * Any wallet that already speaks SEP-43 — Freighter, Albedo, xBull, Lobstr,
 * the Stellar Wallets Kit, or a WalletConnect session — can be adapted to this
 * interface with a thin shim.
 */

/** A transaction object that can be serialized to a base64 XDR string. */
export interface XdrSerializable {
  toXDR: (format?: string) => string;
}

/** Either a raw base64 XDR string or an object that can produce one. */
export type TransactionInput = string | XdrSerializable;

/**
 * Options accepted by {@link WalletSigner.signTransaction}.
 *
 * All fields are optional so that callers may rely on the signer's configured
 * defaults (e.g. the network passphrase passed when the signer was created).
 */
export interface SignTransactionOptions {
  /** Network passphrase the transaction is valid for. */
  networkPassphrase?: string;
  /** Address that should produce the signature (multi-account wallets). */
  address?: string;
  /**
   * Ask the wallet to submit the transaction to the network after signing.
   * WalletConnect maps this to `stellar_signAndSubmitXDR`.
   */
  submit?: boolean;
}

/**
 * Result of a successful signing operation.
 *
 * Field naming follows SEP-43 (`signedTxXdr`, `signerAddress`).
 */
export interface SignedTransaction {
  /** Base64-encoded signed transaction envelope XDR. */
  signedTxXdr: string;
  /** Address that produced the signature, when the wallet reports it. */
  signerAddress?: string;
}

/** The account address a wallet is currently exposing. */
export interface WalletAddress {
  address: string;
}

/**
 * Wallet-agnostic signing contract.
 *
 * Implementations are expected to be cheap to construct and safe to hold for
 * the lifetime of a session. Methods reject (rather than resolve with an error
 * field) on failure so that callers can use ordinary `try/catch`.
 */
export interface WalletSigner {
  /** Stable identifier for the binding, e.g. `"walletconnect"`, `"keypair"`. */
  readonly id: string;
  /** Resolve the address the wallet will sign with. */
  getAddress(): Promise<WalletAddress>;
  /** Sign a transaction and return its signed XDR envelope. */
  signTransaction(
    transaction: TransactionInput,
    options?: SignTransactionOptions,
  ): Promise<SignedTransaction>;
}

/** Normalize a {@link TransactionInput} to a base64 XDR string. */
export function toXdrString(transaction: TransactionInput): string {
  if (typeof transaction === "string") {
    const trimmed = transaction.trim();
    if (!trimmed) {
      throw new Error("Cannot sign an empty transaction XDR string");
    }
    return trimmed;
  }

  if (transaction && typeof transaction.toXDR === "function") {
    return transaction.toXDR();
  }

  throw new Error(
    "Unsupported transaction input: expected a base64 XDR string or an object with toXDR()",
  );
}
