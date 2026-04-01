export type Chain = "stellar" | "evm" | "solana" | "cosmos";

export interface TreasuryAccountBalance {
  address: string;
  nativeBalance: number;
  network: string;
}

export interface ChainTreasuryBalance {
  chain: Chain;
  unit: string;
  nativeBalance: number;
  usdValue: number;
  accountCount: number;
  configured: boolean;
  accounts: TreasuryAccountBalance[];
  error: string | null;
}

export interface MultiChainData {
  chains: ChainTreasuryBalance[];
  totalUsdValue: number;
  priceUpdatedAt: string | null;
  generatedAt: string;
  source: "live" | "sample";
}

const SAMPLE_DATA: MultiChainData = {
  chains: [
    {
      chain: "stellar",
      unit: "XLM",
      nativeBalance: 12500.42,
      usdValue: 1287.54,
      accountCount: 4,
      configured: true,
      accounts: [
        { address: "G...A1", nativeBalance: 4200.1, network: "stellar" },
        { address: "G...B2", nativeBalance: 3100.0, network: "stellar" },
        { address: "G...C3", nativeBalance: 2750.12, network: "stellar" },
        { address: "G...D4", nativeBalance: 2450.2, network: "stellar" },
      ],
      error: null,
    },
    {
      chain: "evm",
      unit: "ETH",
      nativeBalance: 2.35,
      usdValue: 9520.7,
      accountCount: 1,
      configured: true,
      accounts: [
        { address: "0x...9f", nativeBalance: 2.35, network: "Ethereum" },
      ],
      error: null,
    },
    {
      chain: "solana",
      unit: "SOL",
      nativeBalance: 45.8,
      usdValue: 6112.86,
      accountCount: 1,
      configured: true,
      accounts: [
        { address: "6s...Qk", nativeBalance: 45.8, network: "Solana" },
      ],
      error: null,
    },
    {
      chain: "cosmos",
      unit: "ATOM",
      nativeBalance: 320.5,
      usdValue: 2195.43,
      accountCount: 1,
      configured: true,
      accounts: [
        { address: "cosmos1...", nativeBalance: 320.5, network: "Cosmos Hub" },
      ],
      error: null,
    },
  ],
  totalUsdValue: 19116.53,
  priceUpdatedAt: new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  source: "sample",
};

function getBaseUrl() {
  const value = process.env.FLUID_SERVER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getAdminToken() {
  const value = process.env.FLUID_ADMIN_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

export async function getMultiChainData(): Promise<MultiChainData> {
  const baseUrl = getBaseUrl();
  const token = getAdminToken();

  if (baseUrl && token) {
    try {
      const res = await fetch(`${baseUrl}/admin/multi-chain/stats`, {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        return { ...data, source: "live" };
      }
    } catch {
      // fall through
    }
  }

  return SAMPLE_DATA;
}
