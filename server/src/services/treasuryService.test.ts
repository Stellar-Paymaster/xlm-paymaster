import Decimal from "decimal.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAccount: vi.fn(),
  evmGetBalance: vi.fn(),
  solanaGetBalance: vi.fn(),
  cosmosConnect: vi.fn(),
  listEnabledChainsWithSecrets: vi.fn(),
  listEnabledGrantersWithMnemonics: vi.fn(),
  getTokenPriceQuoteUsd: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", () => {
  const MockServer = class {
    loadAccount = mocks.loadAccount;
  };

  return {
    Horizon: {
      Server: vi.fn().mockImplementation(function MockServerFactory() {
        return new MockServer();
      }),
    },
  };
});

vi.mock("ethers", () => {
  const MockJsonRpcProvider = class {
    getBalance = mocks.evmGetBalance;
  };

  const MockWallet = class {
    address = "0xabc";
  };

  return {
    ethers: {
      JsonRpcProvider: vi.fn().mockImplementation(function MockProviderFactory() {
        return new MockJsonRpcProvider();
      }),
      Wallet: vi.fn().mockImplementation(function MockWalletFactory() {
        return new MockWallet();
      }),
      formatEther: vi.fn((value: bigint) => (Number(value) / 1e18).toString()),
    },
  };
});

vi.mock("@solana/web3.js", () => {
  const MockConnection = class {
    getBalance = mocks.solanaGetBalance;
  };

  return {
    Connection: vi.fn().mockImplementation(function MockConnectionFactory() {
      return new MockConnection();
    }),
    Keypair: {
      fromSecretKey: vi.fn().mockReturnValue({
        publicKey: {
          toBase58: () => "So1anaTreasury",
        },
      }),
    },
    LAMPORTS_PER_SOL: 1_000_000_000,
  };
});

vi.mock("@cosmjs/stargate", () => ({
  StargateClient: {
    connect: mocks.cosmosConnect,
  },
}));

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn().mockResolvedValue({
      getAccounts: vi.fn().mockResolvedValue([{ address: "cosmos1treasury" }]),
    }),
  },
}));

vi.mock("./chainRegistryService", () => ({
  listEnabledChainsWithSecrets: mocks.listEnabledChainsWithSecrets,
}));

vi.mock("./cosmosFeeGrant", () => ({
  listEnabledGrantersWithMnemonics: mocks.listEnabledGrantersWithMnemonics,
}));

vi.mock("./priceService", () => ({
  priceService: {
    getTokenPriceQuoteUsd: mocks.getTokenPriceQuoteUsd,
  },
}));

import { getTreasuryOverview } from "./treasuryService";

describe("getTreasuryOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.listEnabledChainsWithSecrets.mockResolvedValue([
      {
        id: "evm-1",
        chainId: "evm",
        name: "Ethereum",
        rpcUrl: "https://evm.example",
        enabled: true,
        hasFeePayerSecret: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        feePayerSecret: "evm-secret",
      },
      {
        id: "sol-1",
        chainId: "solana",
        name: "Solana",
        rpcUrl: "https://sol.example",
        enabled: true,
        hasFeePayerSecret: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        feePayerSecret: Buffer.from(new Uint8Array([1, 2, 3])).toString("base64"),
      },
    ]);

    mocks.listEnabledGrantersWithMnemonics.mockResolvedValue([
      {
        id: "cosmos-1",
        chainId: "cosmoshub-4",
        name: "Cosmos Hub",
        rpcUrl: "https://cosmos.example",
        prefix: "cosmos",
        denom: "uatom",
        enabled: true,
        granterAddress: "cosmos1treasury",
        hasMnemonic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        mnemonic: "mnemonic words",
      },
    ]);

    mocks.getTokenPriceQuoteUsd
      .mockResolvedValueOnce({ price: new Decimal("0.1"), lastUpdatedAt: 1_743_206_400 })
      .mockResolvedValueOnce({ price: new Decimal("2000"), lastUpdatedAt: 1_743_206_500 })
      .mockResolvedValueOnce({ price: new Decimal("100"), lastUpdatedAt: 1_743_206_600 })
      .mockResolvedValueOnce({ price: new Decimal("10"), lastUpdatedAt: 1_743_206_700 });

    mocks.loadAccount
      .mockResolvedValueOnce({ balances: [{ asset_type: "native", balance: "10.0" }] })
      .mockResolvedValueOnce({ balances: [{ asset_type: "native", balance: "5.0" }] });
    mocks.evmGetBalance.mockResolvedValue(2_000_000_000_000_000_000n);
    mocks.solanaGetBalance.mockResolvedValue(3_000_000_000);
    mocks.cosmosConnect.mockResolvedValue({
      getBalance: vi.fn().mockResolvedValue({ amount: "4000000" }),
      disconnect: vi.fn(),
    });
  });

  it("aggregates balances and converts them to USD", async () => {
    const overview = await getTreasuryOverview({
      horizonUrl: "https://horizon.example",
      feePayerAccounts: [{ publicKey: "GAAA" }, { publicKey: "GBBB" }],
    } as any);

    expect(overview.chains.map((chain) => chain.chain)).toEqual([
      "stellar",
      "evm",
      "solana",
      "cosmos",
    ]);
    expect(overview.chains[0]?.nativeBalance).toBe(15);
    expect(overview.chains[0]?.usdValue).toBe(1.5);
    expect(overview.chains[1]?.usdValue).toBe(4000);
    expect(overview.chains[2]?.usdValue).toBe(300);
    expect(overview.chains[3]?.usdValue).toBe(40);
    expect(overview.totalUsdValue).toBe(4341.5);
    expect(overview.priceUpdatedAt).toBe("2025-03-29T00:00:00.000Z");
  });

  it("returns partial results when one chain lookup fails", async () => {
    mocks.evmGetBalance.mockRejectedValueOnce(new Error("rpc unavailable"));

    const overview = await getTreasuryOverview({
      horizonUrl: "https://horizon.example",
      feePayerAccounts: [{ publicKey: "GAAA" }, { publicKey: "GBBB" }],
    } as any);

    const evm = overview.chains.find((chain) => chain.chain === "evm");
    expect(evm?.usdValue).toBe(0);
    expect(evm?.error).toContain("rpc unavailable");
    expect(overview.totalUsdValue).toBe(341.5);
  });
});
