/**
 * WalletConnect bindings for universal Stellar signing.
 *
 * This module implements the standard WalletConnect Stellar namespace so that
 * Fluid example applications can sign fee-bump payloads through any
 * WalletConnect-compatible wallet without taking a hard dependency on the
 * `@walletconnect/*` packages. The provider is injected, which keeps the Fluid
 * client tree-shakeable and lets tests run against a lightweight mock.
 *
 * Standard reference:
 * - Methods: `stellar_signXDR`, `stellar_signAndSubmitXDR`
 * - Chains:  `stellar:pubnet`, `stellar:testnet`
 * - Accounts are reported as `stellar:<network>:<G-address>`
 */

import {
  STELLAR_CHAINS,
  StellarChainId,
  chainIdForPassphrase,
} from "./networks";
import {
  SignTransactionOptions,
  SignedTransaction,
  TransactionInput,
  WalletAddress,
  WalletSigner,
  toXdrString,
} from "./types";

/** WalletConnect namespace key for Stellar. */
export const STELLAR_NAMESPACE = "stellar";

/** RPC methods defined by the Stellar WalletConnect namespace. */
export const STELLAR_METHODS = {
  signXDR: "stellar_signXDR",
  signAndSubmitXDR: "stellar_signAndSubmitXDR",
} as const;

export type StellarMethod =
  (typeof STELLAR_METHODS)[keyof typeof STELLAR_METHODS];

/** Shape of a single `signClient.request` call. */
export interface WalletConnectRequestArgs {
  topic: string;
  chainId: string;
  request: {
    method: string;
    params: unknown;
  };
}

/**
 * Minimal slice of the WalletConnect `SignClient` API that this binding needs.
 * The real `@walletconnect/sign-client` instance satisfies this interface, as
 * do the universal-provider and modal-based clients.
 */
export interface WalletConnectProvider {
  request<T = unknown>(args: WalletConnectRequestArgs): Promise<T>;
}

/** Per-namespace data carried on a connected WalletConnect session. */
export interface WalletConnectNamespace {
  accounts: string[];
  methods: string[];
  events: string[];
  chains?: string[];
}

/** The portion of a WalletConnect session this module reads. */
export interface WalletConnectSession {
  topic: string;
  namespaces: Record<string, WalletConnectNamespace>;
}

/** A `chain:address` pair parsed from a session's account list. */
export interface StellarAccount {
  chainId: StellarChainId | string;
  address: string;
}

/** Options for {@link buildStellarRequiredNamespaces}. */
export interface RequiredNamespacesInput {
  /** Chains to request. Defaults to `[stellar:testnet]`. */
  chains?: StellarChainId[];
  /** Methods to request. Defaults to both Stellar methods. */
  methods?: string[];
  /** Events to request. Defaults to `[]` (Stellar defines none). */
  events?: string[];
}

/**
 * Build the `requiredNamespaces` object passed to `signClient.connect(...)`.
 *
 * @example
 * ```ts
 * const { uri, approval } = await signClient.connect({
 *   requiredNamespaces: buildStellarRequiredNamespaces({
 *     chains: [STELLAR_CHAINS.TESTNET],
 *   }),
 * });
 * ```
 */
export function buildStellarRequiredNamespaces(
  input: RequiredNamespacesInput = {},
): Record<string, Required<Pick<WalletConnectNamespace, "methods" | "events" | "chains">>> {
  const chains = input.chains?.length ? input.chains : [STELLAR_CHAINS.TESTNET];
  const methods = input.methods?.length
    ? input.methods
    : Object.values(STELLAR_METHODS);
  const events = input.events ?? [];

  return {
    [STELLAR_NAMESPACE]: {
      chains: [...chains],
      methods: [...methods],
      events: [...events],
    },
  };
}

/**
 * Parse the Stellar accounts advertised by a connected session.
 *
 * Accounts are CAIP-10 strings such as `stellar:testnet:GAB...`. When
 * `chainId` is provided, only accounts on that chain are returned.
 */
export function parseStellarAccounts(
  session: WalletConnectSession,
  chainId?: string,
): StellarAccount[] {
  const namespace = session.namespaces?.[STELLAR_NAMESPACE];
  if (!namespace || !Array.isArray(namespace.accounts)) {
    return [];
  }

  return namespace.accounts
    .map((entry) => {
      // Format: "<namespace>:<reference>:<address>" → chainId is first two parts.
      const parts = entry.split(":");
      if (parts.length < 3) {
        return undefined;
      }
      const address = parts.slice(2).join(":");
      const accountChainId = `${parts[0]}:${parts[1]}`;
      return { chainId: accountChainId, address } satisfies StellarAccount;
    })
    .filter((account): account is StellarAccount => Boolean(account))
    .filter((account) => (chainId ? account.chainId === chainId : true));
}

/**
 * Normalize the variety of result shapes returned by Stellar wallets into a
 * plain signed-XDR string.
 *
 * Different wallets return `{ signedXDR }`, `{ signedTxXdr }`, `{ xdr }`, or a
 * bare string. This keeps the signer resilient across implementations.
 */
export function extractSignedXdr(result: unknown): string {
  if (typeof result === "string" && result.trim()) {
    return result.trim();
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const candidate =
      record.signedXDR ?? record.signedTxXdr ?? record.signedTransaction ?? record.xdr;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  throw new Error(
    "WalletConnect wallet returned an unrecognized signing response (no signed XDR found)",
  );
}

/** Construction options for {@link WalletConnectSigner}. */
export interface WalletConnectSignerOptions {
  /** Connected WalletConnect provider/sign-client. */
  provider: WalletConnectProvider;
  /** Active session topic. */
  topic: string;
  /** Address that will sign (CAIP-10 reference, G-address only). */
  address: string;
  /**
   * CAIP-2 chain id to scope requests to. If omitted, it is derived from
   * `networkPassphrase`.
   */
  chainId?: StellarChainId | string;
  /** Network passphrase, used to derive `chainId` when not provided. */
  networkPassphrase?: string;
}

/**
 * A {@link WalletSigner} backed by a WalletConnect session.
 *
 * Maps `signTransaction(..., { submit })` to the corresponding Stellar
 * namespace RPC method (`stellar_signXDR` / `stellar_signAndSubmitXDR`).
 */
export class WalletConnectSigner implements WalletSigner {
  readonly id = "walletconnect";

  private readonly provider: WalletConnectProvider;
  private readonly topic: string;
  private readonly address: string;
  private readonly chainId: string;

  constructor(options: WalletConnectSignerOptions) {
    if (!options.provider) {
      throw new Error("WalletConnectSigner requires a provider");
    }
    if (!options.topic) {
      throw new Error("WalletConnectSigner requires a session topic");
    }
    if (!options.address) {
      throw new Error("WalletConnectSigner requires an address");
    }

    this.provider = options.provider;
    this.topic = options.topic;
    this.address = options.address;

    if (options.chainId) {
      this.chainId = options.chainId;
    } else if (options.networkPassphrase) {
      this.chainId = chainIdForPassphrase(options.networkPassphrase);
    } else {
      throw new Error(
        "WalletConnectSigner requires either chainId or networkPassphrase",
      );
    }
  }

  async getAddress(): Promise<WalletAddress> {
    return { address: this.address };
  }

  async signTransaction(
    transaction: TransactionInput,
    options: SignTransactionOptions = {},
  ): Promise<SignedTransaction> {
    const xdr = toXdrString(transaction);
    const method: StellarMethod = options.submit
      ? STELLAR_METHODS.signAndSubmitXDR
      : STELLAR_METHODS.signXDR;

    const result = await this.provider.request({
      topic: this.topic,
      chainId: this.chainId,
      request: {
        method,
        params: { xdr },
      },
    });

    return {
      signedTxXdr: extractSignedXdr(result),
      signerAddress: options.address ?? this.address,
    };
  }
}

/**
 * Convenience factory that builds a {@link WalletConnectSigner} directly from a
 * connected session, selecting the first matching account automatically.
 */
export function createWalletConnectSigner(
  provider: WalletConnectProvider,
  session: WalletConnectSession,
  options: {
    chainId?: StellarChainId | string;
    networkPassphrase?: string;
    address?: string;
  } = {},
): WalletConnectSigner {
  const chainId =
    options.chainId ??
    (options.networkPassphrase
      ? chainIdForPassphrase(options.networkPassphrase)
      : undefined);

  const accounts = parseStellarAccounts(session, chainId);
  const address =
    options.address ?? accounts[0]?.address ?? parseStellarAccounts(session)[0]?.address;

  if (!address) {
    throw new Error(
      "No Stellar account found on the WalletConnect session namespaces",
    );
  }

  return new WalletConnectSigner({
    provider,
    topic: session.topic,
    address,
    chainId,
    networkPassphrase: options.networkPassphrase,
  });
}
