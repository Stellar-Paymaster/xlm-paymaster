/**
 * Universal wallet signing for the Fluid client.
 *
 * Re-exports the wallet-agnostic signer contract, the WalletConnect standard
 * bindings, and ready-made signer adapters (keypair, SEP-43 browser wallets).
 */

export type {
  WalletSigner,
  WalletAddress,
  SignedTransaction,
  SignTransactionOptions,
  TransactionInput,
  XdrSerializable,
} from "./types";
export { toXdrString } from "./types";

export {
  STELLAR_PASSPHRASES,
  STELLAR_CHAINS,
  chainIdForPassphrase,
  passphraseForChainId,
  isStellarChainId,
} from "./networks";
export type { StellarChainId } from "./networks";

export {
  STELLAR_NAMESPACE,
  STELLAR_METHODS,
  WalletConnectSigner,
  buildStellarRequiredNamespaces,
  parseStellarAccounts,
  extractSignedXdr,
  createWalletConnectSigner,
} from "./walletConnect";
export type {
  StellarMethod,
  WalletConnectProvider,
  WalletConnectRequestArgs,
  WalletConnectNamespace,
  WalletConnectSession,
  WalletConnectSignerOptions,
  StellarAccount,
  RequiredNamespacesInput,
} from "./walletConnect";

export { KeypairSigner, Sep43WalletSigner } from "./signers";
export type { KeypairLike, Sep43Wallet } from "./signers";
