import { describe, expect, it, vi } from "vitest";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    signPayload: vi.fn(),
    signPayloadFromVault: vi.fn(),
    preflightSoroban: vi.fn(),
  },
}));

vi.mock("../models/transactionLedger", () => ({
  recordSponsoredTransaction: vi.fn(),
  getTenantDailySpendStroops: vi.fn(async () => 0),
}));

vi.mock("../services/quota", () => ({
  checkTenantDailyQuota: vi.fn(async () => ({
    allowed: true,
    currentSpendStroops: 0,
    projectedSpendStroops: 100,
    dailyQuotaStroops: 1000000,
    currentTxCount: 0,
    projectedTxCount: 1,
    txLimit: 100,
  })),
}));

vi.mock("../workers/transactionStore", () => ({
  transactionStore: {
    addTransaction: vi.fn(),
  },
}));

const { mockPrisma, mockSettlementService } = vi.hoisted(() => ({
  mockPrisma: {
    transaction: {
      create: vi.fn(async () => ({ id: "tx-record-1" })),
      update: vi.fn(),
    },
  },
  mockSettlementService: {
    enqueuePendingSettlement: vi.fn(async () => ({
      settlementId: "settlement-1",
      startBlock: 123,
    })),
    ensureStarted: vi.fn(),
  },
}));

vi.mock("../utils/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../services/crossChainSettlement", () => ({
  getCrossChainSettlementService: vi.fn(() => mockSettlementService),
}));

import StellarSdk from "@stellar/stellar-sdk";
import { feeBumpHandler } from "./feeBump";
import { Config } from "../config";

describe("feeBumpHandler EVM settlement", () => {
  it("queues the Stellar fee-bump until the EVM payment confirms", async () => {
    const sourceKeypair = StellarSdk.Keypair.random();
    const feePayerKeypair = StellarSdk.Keypair.random();

    const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), "1");
    const innerTransaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: "Test SDF Network ; September 2015",
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: sourceKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(0)
      .build();
    innerTransaction.sign(sourceKeypair);

    const config: Config = {
      feePayerAccounts: [
        {
          publicKey: feePayerKeypair.publicKey(),
          keypair: feePayerKeypair,
          secretSource: { type: "env", secret: feePayerKeypair.secret() },
        },
      ],
      signerPool: {
        getSnapshot: () => [{ publicKey: feePayerKeypair.publicKey() }],
      } as any,
      baseFee: 100,
      feeMultiplier: 1,
      networkPassphrase: "Test SDF Network ; September 2015",
      allowedOrigins: ["*"],
      rateLimitWindowMs: 60000,
      rateLimitMax: 10,
      alerting: { checkIntervalMs: 60000, cooldownMs: 3600000 },
      digest: { cronSchedule: "0 8 * * *", enabled: false },
      maxXdrSize: 10000,
      maxOperations: 100,
      horizonSelectionStrategy: "priority",
      horizonUrls: [],
      evmSettlement: {
        enabled: true,
        chainId: 1,
        rpcUrl: "http://evm.example",
        tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        receiverAddress: "0x1111111111111111111111111111111111111111",
        confirmationsRequired: 3,
        pollIntervalMs: 5000,
      },
    };

    const req: any = {
      body: {
        xdr: innerTransaction.toXDR(),
        submit: true,
        evmSettlement: {
          chainId: 1,
          tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          amount: "1000000",
          payerAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    };

    const res: any = {
      locals: {
        apiKey: {
          tenantId: "tenant-1",
          tier: "pro",
          tierName: "Pro",
          tierId: "tier-pro",
          name: "Tenant One",
          apiKey: "test-key",
          key: "test-key",
          txLimit: 100,
          rateLimit: 100,
          priceMonthly: 49,
          maxRequests: 100,
          windowMs: 60000,
          dailyQuotaStroops: 1000000,
          isSandbox: false,
        },
      },
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    let nextErr: any;
    const next = (err: any) => {
      nextErr = err;
    };

    await feeBumpHandler(req, res, next as any, config);

    expect(nextErr).toBeUndefined();
    expect(mockSettlementService.enqueuePendingSettlement).toHaveBeenCalled();
    expect(mockSettlementService.ensureStarted).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "awaiting_evm_payment",
        settlement_id: "settlement-1",
        fee_payer: feePayerKeypair.publicKey(),
        evm_payment: expect.objectContaining({
          chain_id: 1,
          amount: "1000000",
        }),
      }),
    );
  });
});
