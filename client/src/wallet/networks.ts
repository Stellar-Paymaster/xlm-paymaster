/**
 * Stellar network identifiers for WalletConnect.
 *
 * WalletConnect identifies chains using CAIP-2 strings. The Stellar namespace
 * registers two chains: `stellar:pubnet` (mainnet) and `stellar:testnet`.
 * These helpers translate between a Stellar network passphrase — the value the
 * Fluid client already works with — and the corresponding CAIP-2 chain id.
 *
 * Reference: https://github.com/ChainAgnostic/namespaces/blob/main/stellar/caip2.md
 */

/** Canonical Stellar network passphrases. */
export const STELLAR_PASSPHRASES = {
  PUBLIC: "Public Global Stellar Network ; September 2015",
  TESTNET: "Test SDF Network ; September 2015",
} as const;

/** CAIP-2 chain identifiers for the Stellar WalletConnect namespace. */
export const STELLAR_CHAINS = {
  PUBLIC: "stellar:pubnet",
  TESTNET: "stellar:testnet",
} as const;

export type StellarChainId = (typeof STELLAR_CHAINS)[keyof typeof STELLAR_CHAINS];

/**
 * Map a Stellar network passphrase to its WalletConnect chain id.
 *
 * @throws if the passphrase does not match a known public/testnet network.
 */
export function chainIdForPassphrase(networkPassphrase: string): StellarChainId {
  switch (networkPassphrase) {
    case STELLAR_PASSPHRASES.PUBLIC:
      return STELLAR_CHAINS.PUBLIC;
    case STELLAR_PASSPHRASES.TESTNET:
      return STELLAR_CHAINS.TESTNET;
    default:
      throw new Error(
        `Unknown Stellar network passphrase: "${networkPassphrase}". ` +
          "Provide a chainId explicitly for custom networks.",
      );
  }
}

/**
 * Map a WalletConnect chain id back to its Stellar network passphrase.
 *
 * @throws if the chain id is not a recognized Stellar chain.
 */
export function passphraseForChainId(chainId: string): string {
  switch (chainId) {
    case STELLAR_CHAINS.PUBLIC:
      return STELLAR_PASSPHRASES.PUBLIC;
    case STELLAR_CHAINS.TESTNET:
      return STELLAR_PASSPHRASES.TESTNET;
    default:
      throw new Error(`Unknown Stellar WalletConnect chain id: "${chainId}"`);
  }
}

/** Narrow an arbitrary string to a {@link StellarChainId}. */
export function isStellarChainId(value: string): value is StellarChainId {
  return (
    value === STELLAR_CHAINS.PUBLIC || value === STELLAR_CHAINS.TESTNET
  );
}
