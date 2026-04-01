import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import Decimal from "decimal.js";
import { ethers } from "ethers";
import * as StellarSdk from "@stellar/stellar-sdk";
import type { Config } from "../config";
import {
  type EnabledChainSecretRecord,
  listEnabledChainsWithSecrets,
} from "./chainRegistryService";
import { listEnabledGrantersWithMnemonics } from "./cosmosFeeGrant";
import { priceService } from "./priceService";

export type TreasuryChain = "stellar" | "evm" | "solana" | "cosmos";

export interface TreasuryAccountBalance {
  address: string;
  nativeBalance: number;
  network: string;
}

export interface TreasuryChainBalance {
  chain: TreasuryChain;
  unit: string;
  nativeBalance: number;
  usdValue: number;
  accountCount: number;
  configured: boolean;
  accounts: TreasuryAccountBalance[];
  error: string | null;
}

export interface TreasuryOverview {
  chains: TreasuryChainBalance[];
  totalUsdValue: number;
  priceUpdatedAt: string | null;
  generatedAt: string;
}

interface PriceQuote {
  price: Decimal;
  lastUpdatedAt: number | null;
}

interface ChainFetchResult {
  configured: boolean;
  accounts: TreasuryAccountBalance[];
  errors: string[];
}

const CHAIN_ORDER: TreasuryChain[] = ["stellar", "evm", "solana", "cosmos"];

const CHAIN_UNITS: Record<TreasuryChain, string> = {
  stellar: "XLM",
  evm: "ETH",
  solana: "SOL",
  cosmos: "ATOM",
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sumNativeBalance(accounts: TreasuryAccountBalance[]): number {
  return accounts.reduce((total, account) => total + account.nativeBalance, 0);
}

function toUsdValue(balance: number, quote: PriceQuote): number {
  return new Decimal(balance).mul(quote.price).toDecimalPlaces(2).toNumber();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function looksLikeBase64Secret(secret: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(secret) && secret.length > 40;
}

function detectChainFamily(chain: EnabledChainSecretRecord): TreasuryChain | null {
  const chainId = normalizeText(chain.chainId);
  const name = normalizeText(chain.name);
  const rpcUrl = normalizeText(chain.rpcUrl);
  const secret = chain.feePayerSecret ?? "";
  const haystack = `${chainId} ${name} ${rpcUrl}`;

  if (haystack.includes("solana") || haystack.includes("mainnet-beta")) {
    return "solana";
  }

  if (
    haystack.includes("cosmos") ||
    haystack.includes("osmosis") ||
    haystack.includes("celestia") ||
    haystack.includes("juno") ||
    haystack.includes("stargaze") ||
    secret.trim().includes(" ")
  ) {
    return "cosmos";
  }

  if (haystack.includes("stellar") || haystack.includes("horizon")) {
    return "stellar";
  }

  if (
    haystack.includes("evm") ||
    haystack.includes("ethereum") ||
    haystack.includes("base") ||
    haystack.includes("polygon") ||
    haystack.includes("arbitrum") ||
    haystack.includes("optimism") ||
    haystack.includes("avalanche") ||
    rpcUrl.includes("infura") ||
    rpcUrl.includes("alchemy") ||
    rpcUrl.includes("quicknode")
  ) {
    return "evm";
  }

  if (looksLikeBase64Secret(secret)) {
    return "solana";
  }

  if (secret.startsWith("0x") || /^[a-fA-F0-9]{64}$/.test(secret)) {
    return "evm";
  }

  return null;
}

async function settleAccounts(
  configured: boolean,
  lookups: Array<Promise<TreasuryAccountBalance>>,
): Promise<ChainFetchResult> {
  const settled = await Promise.allSettled(lookups);
  const accounts: TreasuryAccountBalance[] = [];
  const errors: string[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      accounts.push(result.value);
      continue;
    }

    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  }

  return { configured, accounts, errors };
}

async function fetchPriceQuotes(): Promise<Record<TreasuryChain, PriceQuote>> {
  const [stellar, evm, solana, cosmos] = await Promise.all([
    priceService.getTokenPriceQuoteUsd("XLM"),
    priceService.getTokenPriceQuoteUsd("ETH"),
    priceService.getTokenPriceQuoteUsd("SOL"),
    priceService.getTokenPriceQuoteUsd("ATOM"),
  ]);

  return { stellar, evm, solana, cosmos };
}

async function fetchStellarAccounts(config: Config): Promise<ChainFetchResult> {
  if (!config.horizonUrl) {
    return { configured: false, accounts: [], errors: [] };
  }

  const server = new StellarSdk.Horizon.Server(config.horizonUrl);

  return settleAccounts(
    config.feePayerAccounts.length > 0,
    config.feePayerAccounts.map(async (account) => {
      const horizonAccount = await withTimeout(
        server.loadAccount(account.publicKey),
        8_000,
        `stellar balance lookup for ${account.publicKey}`,
      );

      const nativeBalance = horizonAccount.balances.find(
        (balance) => balance.asset_type === "native",
      );

      return {
        address: account.publicKey,
        nativeBalance: nativeBalance ? Number.parseFloat(nativeBalance.balance) : 0,
        network: "stellar",
      };
    }),
  );
}

async function fetchEvmAccounts(): Promise<ChainFetchResult> {
  const chains = (await listEnabledChainsWithSecrets()).filter(
    (chain) => detectChainFamily(chain) === "evm" && chain.feePayerSecret,
  );

  return settleAccounts(
    chains.length > 0,
    chains.map(async (chain) => {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const wallet = new ethers.Wallet(chain.feePayerSecret!, provider);
      const balanceWei = await withTimeout(
        provider.getBalance(wallet.address),
        8_000,
        `evm balance lookup for ${chain.name}`,
      );

      return {
        address: wallet.address,
        nativeBalance: Number(ethers.formatEther(balanceWei)),
        network: chain.name,
      };
    }),
  );
}

async function fetchSolanaAccounts(): Promise<ChainFetchResult> {
  const chains = (await listEnabledChainsWithSecrets()).filter(
    (chain) => detectChainFamily(chain) === "solana" && chain.feePayerSecret,
  );

  return settleAccounts(
    chains.length > 0,
    chains.map(async (chain) => {
      const connection = new Connection(chain.rpcUrl);
      const keypair = Keypair.fromSecretKey(Buffer.from(chain.feePayerSecret!, "base64"));
      const lamports = await withTimeout(
        connection.getBalance(keypair.publicKey),
        8_000,
        `solana balance lookup for ${chain.name}`,
      );

      return {
        address: keypair.publicKey.toBase58(),
        nativeBalance: lamports / LAMPORTS_PER_SOL,
        network: chain.name,
      };
    }),
  );
}

async function fetchCosmosAccounts(): Promise<ChainFetchResult> {
  const granters = (await listEnabledGrantersWithMnemonics()).filter(
    (granter) => granter.mnemonic,
  );

  const result = await settleAccounts(
    granters.length > 0,
    granters.map(async (granter) => {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(granter.mnemonic!, {
        prefix: granter.prefix,
      });
      const [account] = await wallet.getAccounts();
      const address = granter.granterAddress ?? account?.address ?? "";
      const client = await withTimeout(
        StargateClient.connect(granter.rpcUrl),
        8_000,
        `cosmos rpc connect for ${granter.name}`,
      );

      try {
        const balance = await withTimeout(
          client.getBalance(address, granter.denom),
          8_000,
          `cosmos balance lookup for ${granter.name}`,
        );

        return {
          address,
          nativeBalance: Number(balance.amount) / 1_000_000,
          network: granter.name,
        };
      } finally {
        client.disconnect();
      }
    }),
  );

  return {
    configured: result.configured,
    accounts: result.accounts.filter((account) => account.address),
    errors: result.errors,
  };
}

async function buildChainBalance(
  chain: TreasuryChain,
  fetcher: () => Promise<ChainFetchResult>,
  quote: PriceQuote,
): Promise<TreasuryChainBalance> {
  try {
    const result = await fetcher();
    const nativeBalance = sumNativeBalance(result.accounts);

    return {
      chain,
      unit: CHAIN_UNITS[chain],
      nativeBalance,
      usdValue: toUsdValue(nativeBalance, quote),
      accountCount: result.accounts.length,
      configured: result.configured,
      accounts: result.accounts,
      error: result.errors.length > 0 ? result.errors.join("; ") : null,
    };
  } catch (error) {
    return {
      chain,
      unit: CHAIN_UNITS[chain],
      nativeBalance: 0,
      usdValue: 0,
      accountCount: 0,
      configured: true,
      accounts: [],
      error: error instanceof Error ? error.message : "Failed to fetch chain balance",
    };
  }
}

export async function getTreasuryOverview(config: Config): Promise<TreasuryOverview> {
  const quotes = await fetchPriceQuotes();

  const chainResults = await Promise.all([
    buildChainBalance("stellar", () => fetchStellarAccounts(config), quotes.stellar),
    buildChainBalance("evm", fetchEvmAccounts, quotes.evm),
    buildChainBalance("solana", fetchSolanaAccounts, quotes.solana),
    buildChainBalance("cosmos", fetchCosmosAccounts, quotes.cosmos),
  ]);

  const orderedChains = CHAIN_ORDER.map(
    (chain) => chainResults.find((result) => result.chain === chain)!,
  );

  const totalUsdValue = orderedChains.reduce((total, chain) => total + chain.usdValue, 0);
  const priceTimestamps = Object.values(quotes)
    .map((quote) => quote.lastUpdatedAt)
    .filter((value): value is number => value !== null);

  return {
    chains: orderedChains,
    totalUsdValue: Number(totalUsdValue.toFixed(2)),
    priceUpdatedAt:
      priceTimestamps.length > 0
        ? new Date(Math.min(...priceTimestamps) * 1000).toISOString()
        : null,
    generatedAt: new Date().toISOString(),
  };
}
