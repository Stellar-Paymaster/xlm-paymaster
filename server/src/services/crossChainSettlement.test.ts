import { beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "../config";
import {
  CrossChainSettlementService,
  EvmChainClient,
  SettlementExecutor,
} from "./crossChainSettlement";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    signPayload: vi.fn(),
    signPayloadFromVault: vi.fn(),
    preflightSoroban: vi.fn(),
  },
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    crossChainSettlement: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../utils/db", () => ({
  default: mockPrisma,
}));

describe("CrossChainSettlementService", () => {
  const feePayerKeypair = {
    publicKey: () => "GFEEPAYER",
    secret: () => "SFEEPAYER",
  } as any;

  let config: Config;
  let executor: SettlementExecutor;
  let client: EvmChainClient;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      feePayerAccounts: [
        {
          publicKey: "GFEEPAYER",
          keypair: feePayerKeypair,
          secretSource: { type: "env", secret: "SFEEPAYER" },
        },
      ],
      signerPool: {
        getSnapshot: () => [{ publicKey: "GFEEPAYER" }],
      } as any,
      baseFee: 100,
      feeMultiplier: 2,
      networkPassphrase: "Test SDF Network ; September 2015",
      horizonUrls: [],
      horizonSelectionStrategy: "priority",
      maxXdrSize: 10240,
      maxOperations: 100,
      allowedOrigins: ["*"],
      rateLimitWindowMs: 60000,
      rateLimitMax: 5,
      alerting: {} as any,
      digest: { cronSchedule: "0 8 * * *", enabled: false },
      evmSettlement: {
        enabled: true,
        chainId: 1,
        rpcUrl: "http://evm.example",
        tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        receiverAddress: "0x1111111111111111111111111111111111111111",
        refundFromAddress: "0x2222222222222222222222222222222222222222",
        confirmationsRequired: 3,
        pollIntervalMs: 1000,
      },
    };

    executor = {
      execute: vi.fn(),
    };

    client = {
      getBlockNumber: vi.fn(),
      findConfirmedPayment: vi.fn(),
      refundToken: vi.fn(),
    };
  });

  it("settles Stellar sponsorship after confirmed EVM payment", async () => {
    mockPrisma.crossChainSettlement.findMany.mockResolvedValue([
      {
        id: "settlement-1",
        transactionId: "tx-1",
        tenantId: "tenant-1",
        sourceTokenAddress: config.evmSettlement!.tokenAddress,
        sourceAmount: "1000000",
        payerAddress: "0x3333333333333333333333333333333333333333",
        recipientAddress: config.evmSettlement!.receiverAddress,
        startBlock: 100,
        confirmationsRequired: 3,
        xdr: "AAAA",
        submit: true,
      },
    ]);
    (client.findConfirmedPayment as any).mockResolvedValue({
      txHash: "0xpayment",
      blockNumber: 110,
      amount: BigInt(1000000),
    });

    const service = new CrossChainSettlementService(config, executor, client);
    await service.processPendingSettlements();

    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "tx-1",
        tenantId: "tenant-1",
        xdr: "AAAA",
        submit: true,
      }),
    );
    expect(mockPrisma.crossChainSettlement.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "settlement-1" },
        data: expect.objectContaining({
          status: "EVM_CONFIRMED",
          sourceTxHash: "0xpayment",
        }),
      }),
    );
    expect(mockPrisma.crossChainSettlement.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "settlement-1" },
        data: expect.objectContaining({
          status: "STELLAR_SETTLED",
        }),
      }),
    );
  });

  it("refunds the EVM payment when Stellar settlement fails", async () => {
    mockPrisma.crossChainSettlement.findMany.mockResolvedValue([
      {
        id: "settlement-2",
        transactionId: "tx-2",
        tenantId: "tenant-2",
        sourceTokenAddress: config.evmSettlement!.tokenAddress,
        sourceAmount: "2500000",
        payerAddress: "0x4444444444444444444444444444444444444444",
        recipientAddress: config.evmSettlement!.receiverAddress,
        startBlock: 200,
        confirmationsRequired: 3,
        xdr: "BBBB",
        submit: false,
      },
    ]);
    (client.findConfirmedPayment as any).mockResolvedValue({
      txHash: "0xpayment-2",
      blockNumber: 210,
      amount: BigInt(2500000),
    });
    (executor.execute as any).mockRejectedValue(new Error("stellar submit failed"));
    (client.refundToken as any).mockResolvedValue("0xrefund");

    const service = new CrossChainSettlementService(config, executor, client);
    await service.processPendingSettlements();

    expect(client.refundToken).toHaveBeenCalledWith({
      tokenAddress: config.evmSettlement!.tokenAddress,
      fromAddress: config.evmSettlement!.refundFromAddress,
      recipientAddress: "0x4444444444444444444444444444444444444444",
      amount: BigInt(2500000),
    });
    expect(mockPrisma.crossChainSettlement.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "settlement-2" },
        data: expect.objectContaining({
          status: "REFUNDED",
          refundTxHash: "0xrefund",
        }),
      }),
    );
  });
});
