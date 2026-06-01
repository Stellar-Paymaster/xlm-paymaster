import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    preflightSoroban: vi.fn(),
    signPayload: vi.fn(async () => Buffer.alloc(64)),
    signPayloadFromVault: vi.fn(async () => Buffer.alloc(64)),
  },
}));

vi.mock("../utils/db", () => ({
  prisma: {
    transaction: {
      create: vi.fn(async () => ({ id: "tx-record-1" })),
      update: vi.fn(),
    },
  },
  default: {
    transaction: {
      create: vi.fn(async () => ({ id: "tx-record-1" })),
      update: vi.fn(),
    },
    sponsoredTransaction: {
      create: vi.fn(async () => ({
        id: "sponsored-1",
        tenantId: "test-tenant",
        feeStroops: BigInt(100),
        createdAt: new Date(),
      })),
      aggregate: vi.fn(async () => ({ _sum: { feeStroops: BigInt(0) } })),
      count: vi.fn(async () => 0),
    },
  },
}));

import StellarSdk from "@stellar/stellar-sdk";
import Decimal from "decimal.js";
import { NextFunction, Request, Response } from "express";
import { Config } from "../config";
import { ApiKeyConfig } from "../middleware/apiKeys";
import { MockPriceOracle } from "../utils/priceOracle";
import { feeBumpHandler } from "./feeBump";

describe("feeBumpHandler - Slippage Protection", () => {
  let mockConfig: Config;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockApiKeyConfig: ApiKeyConfig;
  let feePayerKeypair: ReturnType<typeof StellarSdk.Keypair.random>;
  let spyGetCurrentPrice: ReturnType<typeof vi.spyOn>;
  let spyGetHistoricalPrice: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    feePayerKeypair = StellarSdk.Keypair.random();

    mockConfig = {
      feePayerAccounts: [
        {
          publicKey: feePayerKeypair.publicKey(),
          keypair: feePayerKeypair,
          secretSource: { type: "env", secret: feePayerKeypair.secret() },
        },
      ],
      signerPool: {
        getSnapshot: () => [{
          publicKey: feePayerKeypair.publicKey(),
          active: true,
          balance: null,
          inFlight: 0,
          totalUses: 0,
          sequenceNumber: null,
          status: "active",
        }],
      } as any,
      baseFee: 100,
      feeMultiplier: 2.0,
      networkPassphrase: "Test SDF Network ; September 2015",
      horizonUrls: [],
      horizonSelectionStrategy: "priority",
      maxXdrSize: 10240,
      maxOperations: 100,
      allowedOrigins: ["*"],
      rateLimitWindowMs: 60000,
      rateLimitMax: 5,
      alerting: {} as any,
      supportedAssets: [{ code: "XLM" }],
    };

    mockApiKeyConfig = {
      key: "test-key",
      tenantId: "test-tenant",
      name: "Test API Key",
      tier: "pro",
      tierName: "Pro",
      tierId: "tier-pro",
      txLimit: 1000,
      rateLimit: 100,
      priceMonthly: 49,
      maxRequests: 100,
      windowMs: 60000,
      dailyQuotaStroops: 1000000,
      isSandbox: false,
      allowedChains: ["stellar"] as any,
      region: "US" as const,
    };

    mockReq = { body: {}, headers: {}, method: "POST", url: "/fee-bump" };
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
      locals: { apiKey: mockApiKeyConfig },
    };
    mockNext = vi.fn();

    spyGetCurrentPrice = vi.spyOn(MockPriceOracle.prototype, "getCurrentPrice");
    spyGetHistoricalPrice = vi.spyOn(MockPriceOracle.prototype, "getHistoricalPrice");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildSignedXdr(): string {
    const keypair = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(keypair.publicKey(), "1000000000");
    const dest = StellarSdk.Keypair.random().publicKey();
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: mockConfig.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: dest,
          asset: StellarSdk.Asset.native(),
          amount: "1000",
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    return tx.toXDR();
  }

  it("should reject transaction when slippage exceeds maxSlippage", async () => {
    spyGetHistoricalPrice.mockResolvedValue(new Decimal("0.10"));
    spyGetCurrentPrice.mockResolvedValue(new Decimal("0.105")); // 5% increase

    mockReq.body = { xdr: buildSignedXdr(), submit: false, token: "XLM", maxSlippage: 1.0 };

    await feeBumpHandler(mockReq as Request, mockRes as Response, mockNext, mockConfig);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "SLIPPAGE_TOO_HIGH",
        message: "Slippage too high: try increasing your fee payment",
      }),
    );
  });

  it("should allow transaction when slippage is within maxSlippage", async () => {
    spyGetHistoricalPrice.mockResolvedValue(new Decimal("0.10"));
    spyGetCurrentPrice.mockResolvedValue(new Decimal("0.1005")); // 0.5% increase

    mockReq.body = { xdr: buildSignedXdr(), submit: false, token: "XLM", maxSlippage: 1.0 };

    await feeBumpHandler(mockReq as Request, mockRes as Response, mockNext, mockConfig);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready", fee_payer: expect.any(String), xdr: expect.any(String) }),
    );
  });

  it("should skip slippage validation when token is not provided", async () => {
    mockReq.body = { xdr: buildSignedXdr(), submit: false };

    await feeBumpHandler(mockReq as Request, mockRes as Response, mockNext, mockConfig);

    expect(spyGetCurrentPrice).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready", fee_payer: expect.any(String), xdr: expect.any(String) }),
    );
  });
});
